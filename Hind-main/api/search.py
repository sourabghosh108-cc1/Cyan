from http.server import BaseHTTPRequestHandler
import urllib.parse
import json
import re
from ddgs import DDGS

def get_videos(query, page=1, limit=25):
    videos = []
    status = "ok"
    message = ""
    try:
        with DDGS(timeout=10) as ddgs:
            results = ddgs.videos(query, max_results=limit, page=page)
            seen_urls = set()
            for r in results:
                url = r.get('content', '')
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                m = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
                vid_id = m.group(1) if m else ''
                images_dict = r.get('images') or {}
                thumb = ''
                if isinstance(images_dict, dict):
                    thumb = images_dict.get('medium') or images_dict.get('large') or images_dict.get('small') or ''
                if not thumb and vid_id:
                    thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                videos.append({
                    'title': r.get('title', 'No title'),
                    'url': url,
                    'publisher': r.get('publisher', ''),
                    'duration': r.get('duration', ''),
                    'embed_url': r.get('embed_url', ''),
                    'thumbnail': thumb,
                    'description': r.get('description', ''),
                    'videoId': vid_id
                })
        if not videos:
            status = "no_results"
            message = "No videos found for this search."
    except Exception as e:
        err_msg = str(e).strip().lower()
        if "no results found" in err_msg:
            status = "no_results"
            message = "No videos found for this search."
        else:
            status = "temporary_error"
            message = "Video search is temporarily unavailable. Please try again later."
    return videos, status, message

def get_web(query, page=1, limit=25):
    items = []
    try:
        with DDGS(timeout=8) as ddgs:
            results = list(ddgs.text(query, page=page, max_results=limit))
            seen = set()
            for r in results:
                href = r.get('href', '')
                if href and href not in seen:
                    seen.add(href)
                    items.append({
                        'title': r.get('title', ''),
                        'url': href,
                        'snippet': r.get('body', '')
                    })
    except Exception:
        pass
    return items

def get_images(query, page=1, limit=25):
    items = []
    try:
        with DDGS(timeout=8) as ddgs:
            results = list(ddgs.images(query, page=page, max_results=limit))
            for r in results:
                items.append({
                    'title': r.get('title', ''),
                    'image': r.get('image', ''),
                    'thumbnail': r.get('thumbnail', ''),
                    'source': r.get('url', '')
                })
    except Exception:
        pass
    return items

def get_news(query, page=1, limit=20):
    items = []
    try:
        with DDGS(timeout=8) as ddgs:
            results = list(ddgs.news(query, page=page, max_results=limit))
            for r in results:
                items.append({
                    'title': r.get('title', ''),
                    'url': r.get('url', ''),
                    'snippet': r.get('body', ''),
                    'source': r.get('source', ''),
                    'date': r.get('date', '')
                })
    except Exception:
        pass
    return items


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        query = params.get('q', [''])[0].strip()
        search_type = params.get('type', ['web'])[0].strip().lower()
        page = int(params.get('page', ['1'])[0])
        limit = int(params.get('limit', ['25'])[0])

        if not query:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Empty query'}).encode('utf-8'))
            return

        has_previous = page > 1

        if search_type == 'videos':
            videos, status, message = get_videos(query, page, limit)
            has_next = len(videos) > 0 and page < 50
            resp = {
                'query': query,
                'type': 'videos',
                'page': page,
                'limit': limit,
                'has_previous': has_previous,
                'has_next': has_next,
                'total_pages': 50 if has_next else page,
                'status': status,
                'message': message,
                'videos': videos
            }
        elif search_type == 'images':
            images = get_images(query, page, limit)
            has_next = len(images) >= limit and page < 50
            resp = {
                'query': query,
                'type': 'images',
                'page': page,
                'limit': limit,
                'has_previous': has_previous,
                'has_next': has_next,
                'total_pages': 50 if has_next else page,
                'images': images
            }
        elif search_type == 'news':
            news = get_news(query, page, limit)
            has_next = len(news) >= limit and page < 50
            resp = {
                'query': query,
                'type': 'news',
                'page': page,
                'limit': limit,
                'has_previous': has_previous,
                'has_next': has_next,
                'total_pages': 50 if has_next else page,
                'news': news
            }
        elif search_type == 'all':
            web = get_web(query, page, limit)
            images = get_images(query, page, limit)
            videos, _, _ = get_videos(query, page, limit)
            news = get_news(query, page, limit)
            has_next = len(web) >= limit and page < 50
            resp = {
                'query': query,
                'type': 'all',
                'page': page,
                'limit': limit,
                'has_previous': has_previous,
                'has_next': has_next,
                'total_pages': 50 if has_next else page,
                'web': web,
                'images': images,
                'videos': videos,
                'news': news
            }
        else:
            web = get_web(query, page, limit)
            has_next = len(web) >= limit and page < 50
            resp = {
                'query': query,
                'type': 'web',
                'page': page,
                'limit': limit,
                'has_previous': has_previous,
                'has_next': has_next,
                'total_pages': 50 if has_next else page,
                'web': web
            }

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
        self.wfile.write(json.dumps(resp).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
