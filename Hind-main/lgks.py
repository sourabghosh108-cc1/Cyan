from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from ddgs import DDGS
from cachetools import TTLCache
from concurrent.futures import ThreadPoolExecutor
import asyncio
import urllib.request
import urllib.parse
import re
import json

app = FastAPI(
    title="Hind Search API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Page-aware TTL Cache (5 minutes)
cache = TTLCache(
    maxsize=10000,
    ttl=300
)

executor = ThreadPoolExecutor(
    max_workers=30
)


def web_search(query, page=1, limit=25):
    try:
        items = []
        seen_urls = set()

        # 1. Primary: DDGS full web search with page parameter
        try:
            with DDGS(timeout=8) as ddgs:
                results = list(ddgs.text(query, page=page, max_results=limit))
                for r in results:
                    url = r.get("href", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        items.append({
                            "title": r.get("title", ""),
                            "url": url,
                            "snippet": r.get("body", "")
                        })
        except Exception:
            pass

        # 2. Secondary: If fewer than limit results, augment with Wikipedia search at page offset
        if len(items) < limit:
            try:
                sroffset = (page - 1) * limit
                needed = limit - len(items)
                wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&sroffset={sroffset}&srlimit={needed}&utf8=&format=json"
                req = urllib.request.Request(wiki_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=4) as res:
                    wdata = json.loads(res.read().decode('utf-8'))
                    for hit in wdata.get('query', {}).get('search', []):
                        title = hit.get('title', '')
                        wurl = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}"
                        if wurl not in seen_urls:
                            seen_urls.add(wurl)
                            clean_snippet = re.sub(r'<[^>]+>', '', hit.get('snippet', ''))
                            items.append({
                                "title": title,
                                "url": wurl,
                                "snippet": clean_snippet
                            })
            except Exception:
                pass

        return items[:limit] if items else []
    except Exception:
        return []


def image_search(query, page=1, limit=25):
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.images(
                query,
                page=page,
                max_results=limit
            )

            if results:
                return [
                    {
                        "title": r.get("title", ""),
                        "image": r.get("image", ""),
                        "thumbnail": r.get("thumbnail", ""),
                        "source": r.get("url", "")
                    }
                    for r in results
                ]
    except Exception:
        pass
    return []


def fetch_youtube_videos(query, page=1, limit=25):
    encoded_q = urllib.parse.quote(query)
    url = f"https://www.youtube.com/results?search_query={encoded_q}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=7) as response:
            html = response.read().decode('utf-8', errors='ignore')
            match = re.search(r'ytInitialData\s*=\s*(\{.+?\});', html)
            if match:
                data = json.loads(match.group(1))
                videos = []
                seen_ids = set()

                def extract(obj):
                    if isinstance(obj, dict):
                        if 'videoRenderer' in obj:
                            vr = obj['videoRenderer']
                            vid = vr.get('videoId')
                            if vid and vid not in seen_ids:
                                seen_ids.add(vid)
                                title_runs = vr.get('title', {}).get('runs', [])
                                title = title_runs[0].get('text', '') if title_runs else vr.get('title', {}).get('simpleText', '')
                                owner_runs = vr.get('ownerText', {}).get('runs', [])
                                owner = owner_runs[0].get('text', '') if owner_runs else 'YouTube'
                                duration = vr.get('lengthText', {}).get('simpleText', 'HD')
                                desc_snippets = vr.get('detailedMetadataSnippets', [])
                                desc = ''
                                if desc_snippets and 'snippetText' in desc_snippets[0]:
                                    runs = desc_snippets[0]['snippetText'].get('runs', [])
                                    desc = ''.join([r.get('text', '') for r in runs])
                                if title:
                                    videos.append({
                                        "title": title,
                                        "url": f"https://www.youtube.com/watch?v={vid}",
                                        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                                        "description": desc or f"{owner} • Watch on YouTube",
                                        "publisher": owner,
                                        "duration": duration,
                                        "videoId": vid
                                    })
                        for v in obj.values():
                            extract(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            extract(item)

                extract(data)
                if videos:
                    offset = (page - 1) * limit
                    return videos[offset:offset + limit] if offset < len(videos) else videos[:limit]
    except Exception:
        pass
    return []


def video_search(query, page=1, limit=25):
    yt_results = fetch_youtube_videos(query, page=page, limit=limit)
    if yt_results and len(yt_results) >= limit:
        return yt_results[:limit]

    items = list(yt_results) if yt_results else []
    seen_urls = {item["url"] for item in items}
    seen_ids = {item["videoId"] for item in items if item.get("videoId")}

    # 1. Try DDGS videos search engine
    try:
        with DDGS(timeout=6) as ddgs:
            results = ddgs.videos(query, page=page, max_results=limit)
            if results and isinstance(results, list):
                for r in results:
                    url = r.get("content", r.get("url", ""))
                    if not url or url in seen_urls:
                        continue
                    m = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
                    vid_id = m.group(1) if m else ""
                    if vid_id and vid_id in seen_ids:
                        continue
                    thumb = r.get("thumbnail", "")
                    if vid_id and (not thumb or "placeholder" in thumb):
                        thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                    elif not thumb:
                        thumb = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80"
                    
                    if vid_id:
                        seen_ids.add(vid_id)
                    seen_urls.add(url)
                    
                    items.append({
                        "title": r.get("title", ""),
                        "url": url,
                        "thumbnail": thumb,
                        "description": r.get("description", ""),
                        "publisher": r.get("publisher", "YouTube" if "youtube" in url else "Video"),
                        "duration": r.get("duration", "HD"),
                        "videoId": vid_id
                    })
    except Exception:
        pass

    # 2. DDGS Text Search Fallback for Videos (site:youtube.com or video keywords)
    if len(items) < limit:
        try:
            with DDGS(timeout=8) as ddgs:
                ddgs_text_results = list(ddgs.text(f"{query} site:youtube.com", page=page, max_results=limit * 2))
                for r in ddgs_text_results:
                    url = r.get("href", "")
                    if not url or url in seen_urls:
                        continue
                    m = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
                    vid_id = m.group(1) if m else ""
                    if vid_id and vid_id in seen_ids:
                        continue
                    
                    title = r.get("title", "")
                    if title.endswith(" - YouTube"):
                        title = title[:-10].strip()
                    
                    thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg" if vid_id else "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80"
                    
                    if vid_id:
                        seen_ids.add(vid_id)
                    seen_urls.add(url)
                    
                    items.append({
                        "title": title or "YouTube Video",
                        "url": url,
                        "thumbnail": thumb,
                        "description": r.get("body", "Watch on YouTube"),
                        "publisher": "YouTube",
                        "duration": "HD",
                        "videoId": vid_id
                    })
                    if len(items) >= limit:
                        break
        except Exception:
            pass

    return items[:limit] if items else []


def news_search(query, page=1, limit=20):
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.news(
                query,
                page=page,
                max_results=limit
            )

            if results:
                return [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "snippet": r.get("body", ""),
                        "source": r.get("source", ""),
                        "date": r.get("date", "")
                    }
                    for r in results
                ]
    except Exception:
        pass
    return []


async def run_search(function, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        executor,
        function,
        *args
    )


@app.get("/api/search")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("web"),
    page: int = Query(1, ge=1, le=50),
    limit: int = Query(25, ge=1, le=50)
):
    query = q.strip().lower()

    if not query:
        return {
            "query": q,
            "error": "Empty query"
        }

    # Cache key includes page to prevent page collisions
    cache_key = f"{query}:{type}:{page}:{limit}"

    if cache_key in cache:
        return cache[cache_key]

    has_previous = page > 1

    if type == "web":
        web = await run_search(web_search, query, page, limit)
        has_next = isinstance(web, list) and len(web) >= limit and page < 50
        response = {
            "query": q,
            "type": "web",
            "page": page,
            "limit": limit,
            "has_previous": has_previous,
            "has_next": has_next,
            "total_pages": 50 if has_next else page,
            "web": web
        }

    elif type == "images":
        images = await run_search(image_search, query, page, limit)
        has_next = isinstance(images, list) and len(images) >= limit and page < 50
        response = {
            "query": q,
            "type": "images",
            "page": page,
            "limit": limit,
            "has_previous": has_previous,
            "has_next": has_next,
            "total_pages": 50 if has_next else page,
            "images": images
        }

    elif type == "videos":
        videos = await run_search(video_search, query, page, limit)
        has_next = isinstance(videos, list) and len(videos) > 0 and page < 50
        response = {
            "query": q,
            "type": "videos",
            "page": page,
            "limit": limit,
            "has_previous": has_previous,
            "has_next": has_next,
            "total_pages": 50 if has_next else page,
            "videos": videos
        }

    elif type == "news":
        news = await run_search(news_search, query, page, limit)
        has_next = isinstance(news, list) and len(news) >= limit and page < 50
        response = {
            "query": q,
            "type": "news",
            "page": page,
            "limit": limit,
            "has_previous": has_previous,
            "has_next": has_next,
            "total_pages": 50 if has_next else page,
            "news": news
        }

    elif type == "all":
        web_task = run_search(web_search, query, page, limit)
        image_task = run_search(image_search, query, page, limit)
        video_task = run_search(video_search, query, page, limit)
        news_task = run_search(news_search, query, page, limit)

        web, images, videos, news = await asyncio.gather(
            web_task,
            image_task,
            video_task,
            news_task
        )

        has_next = (isinstance(web, list) and len(web) >= limit) and page < 50
        response = {
            "query": q,
            "type": "all",
            "page": page,
            "limit": limit,
            "has_previous": has_previous,
            "has_next": has_next,
            "total_pages": 50 if has_next else page,
            "web": web,
            "images": images,
            "videos": videos,
            "news": news
        }

    else:
        return {
            "query": q,
            "error": "Invalid search type"
        }

    cache[cache_key] = response
    return response


@app.get("/api/autocomplete")
def autocomplete(q: str = Query(..., min_length=1)):
    query = q.strip()
    if not query:
        return []
    try:
        url = f"https://suggestqueries.google.com/complete/search?client=chrome&q={urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode('utf-8'))
            return data[1] if isinstance(data, list) and len(data) > 1 else []
    except Exception:
        pass
    return []


@app.get("/")
def health():
    return {
        "service": "Hind Search",
        "status": "online",
        "version": "1.0.0"
    }
