from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from ddgs import DDGS
from cachetools import TTLCache
from concurrent.futures import ThreadPoolExecutor
import asyncio

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

# Temporary local cache.
# Later replace with Redis for multi-server scaling.
cache = TTLCache(
    maxsize=10000,
    ttl=300
)

executor = ThreadPoolExecutor(
    max_workers=20
)


def web_search(query, limit=10):
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.text(
                query,
                max_results=limit
            )

            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", "")
                }
                for r in results
            ]

    except Exception as e:
        return {"error": str(e)}


def image_search(query, limit=10):
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.images(
                query,
                max_results=limit
            )

            return [
                {
                    "title": r.get("title", ""),
                    "image": r.get("image", ""),
                    "thumbnail": r.get("thumbnail", ""),
                    "source": r.get("url", "")
                }
                for r in results
            ]

    except Exception as e:
        return {"error": str(e)}


import urllib.request
import urllib.parse
import re
import json

def fetch_youtube_videos(query, limit=10):
    encoded_q = urllib.parse.quote(query)
    url = f"https://www.youtube.com/results?search_query={encoded_q}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            html = response.read().decode('utf-8', errors='ignore')
            match = re.search(r'ytInitialData\s*=\s*(\{.+?\});', html)
            if match:
                data = json.loads(match.group(1))
                contents = data.get('contents', {}).get('twoColumnSearchResultsRenderer', {}).get('primaryContents', {}).get('sectionListRenderer', {}).get('contents', [])
                videos = []
                for sec in contents:
                    items = sec.get('itemSectionRenderer', {}).get('contents', [])
                    for item in items:
                        if 'videoRenderer' in item:
                            vr = item['videoRenderer']
                            vid_id = vr.get('videoId')
                            title_runs = vr.get('title', {}).get('runs', [])
                            title = title_runs[0].get('text', '') if title_runs else ''
                            desc_snippets = vr.get('detailedMetadataSnippets', [])
                            desc = ''
                            if desc_snippets and 'snippetText' in desc_snippets[0]:
                                runs = desc_snippets[0]['snippetText'].get('runs', [])
                                desc = ''.join([r.get('text', '') for r in runs])
                            owner_runs = vr.get('ownerText', {}).get('runs', [])
                            owner = owner_runs[0].get('text', '') if owner_runs else 'YouTube'
                            duration = vr.get('lengthText', {}).get('simpleText', '')
                            if vid_id and title:
                                videos.append({
                                    "title": title,
                                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                                    "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
                                    "description": desc or (f"{owner} • {duration}" if duration else owner),
                                    "publisher": owner,
                                    "duration": duration
                                })
                                if len(videos) >= limit:
                                    break
                    if len(videos) >= limit:
                        break
                if videos:
                    return videos
    except Exception:
        pass
    return []


def video_search(query, limit=10):
    # Try YouTube Search scraper first (fast & reliable)
    yt_results = fetch_youtube_videos(query, limit)
    if yt_results:
        return yt_results

    # Fallback to DDGS videos
    try:
        with DDGS(timeout=5) as ddgs:
            results = ddgs.videos(query, max_results=limit)
            if results and isinstance(results, list) and len(results) > 0:
                return [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("content", r.get("url", "")),
                        "thumbnail": r.get("thumbnail", ""),
                        "description": r.get("description", ""),
                        "publisher": r.get("publisher", "")
                    }
                    for r in results
                ]
    except Exception:
        pass

    return []


def news_search(query, limit=10):
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.news(
                query,
                max_results=limit
            )

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

    except Exception as e:
        return {"error": str(e)}


async def run_search(function, query, limit):
    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(
        executor,
        function,
        query,
        limit
    )


@app.get("/api/search")
async def search(
    q: str = Query(..., min_length=1),
    type: str = Query("web"),
    limit: int = Query(10, ge=1, le=50)
):

    query = q.strip().lower()

    if not query:
        return {
            "query": q,
            "error": "Empty query"
        }

    cache_key = f"{query}:{type}:{limit}"

    if cache_key in cache:
        return cache[cache_key]

    if type == "web":

        web = await run_search(
            web_search,
            query,
            limit
        )

        response = {
            "query": q,
            "type": "web",
            "web": web
        }

    elif type == "images":

        images = await run_search(
            image_search,
            query,
            limit
        )

        response = {
            "query": q,
            "type": "images",
            "images": images
        }

    elif type == "videos":

        videos = await run_search(
            video_search,
            query,
            limit
        )

        response = {
            "query": q,
            "type": "videos",
            "videos": videos
        }

    elif type == "news":

        news = await run_search(
            news_search,
            query,
            limit
        )

        response = {
            "query": q,
            "type": "news",
            "news": news
        }

    elif type == "all":

        web_task = run_search(
            web_search,
            query,
            limit
        )

        image_task = run_search(
            image_search,
            query,
            limit
        )

        video_task = run_search(
            video_search,
            query,
            limit
        )

        news_task = run_search(
            news_search,
            query,
            limit
        )

        web, images, videos, news = await asyncio.gather(
            web_task,
            image_task,
            video_task,
            news_task
        )

        response = {
            "query": q,
            "type": "all",
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


@app.get("/")
def health():
    return {
        "service": "Hind Search",
        "status": "online",
        "version": "1.0.0"
    }
