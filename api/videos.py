from http.server import BaseHTTPRequestHandler
import urllib.parse
import json
import re
from ddgs import DDGS

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        query = params.get('q', [''])[0].strip()
        page = int(params.get('page', ['1'])[0])
        limit = int(params.get('limit', ['25'])[0])

        if not query:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Empty query'}).encode('utf-8'))
            return

        videos = []
        status = "ok"
        message = ""

        try:
            with DDGS(timeout=10) as ddgs:
                results = ddgs.videos(
                    query,
                    max_results=limit,
                    page=page
                )
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

        has_previous = page > 1
        has_next = len(videos) > 0 and page < 50
        response_data = {
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

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
