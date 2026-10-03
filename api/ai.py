from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error

# In-memory credit tracker: IP -> credits remaining
# Initial credit balance: 100 credits
# Cost per successful AI query: 5 credits
CREDIT_ALLOWANCE = 100
CREDIT_COST = 5
CREDIT_STORE = {}

def get_client_ip(handler_instance):
    """Safely extracts client IP address from standard proxy/CDN headers."""
    forwarded = handler_instance.headers.get('x-forwarded-for', '')
    if forwarded:
        # First IP in comma-separated chain is the client IP
        return forwarded.split(',')[0].strip()
    real_ip = handler_instance.headers.get('x-real-ip', '')
    if real_ip:
        return real_ip.strip()
    client_address = getattr(handler_instance, 'client_address', None)
    if client_address and len(client_address) > 0:
        return str(client_address[0])
    return 'default_client'

def get_credits(ip):
    if ip not in CREDIT_STORE:
        CREDIT_STORE[ip] = CREDIT_ALLOWANCE
    return CREDIT_STORE[ip]

def deduct_credits(ip, amount=CREDIT_COST):
    current = get_credits(ip)
    CREDIT_STORE[ip] = max(0, current - amount)
    return CREDIT_STORE[ip]

def call_ai_provider(prompt, api_key):
    """
    Calls the configured server-side AI provider.
    The API key is kept strictly within this server-side execution.
    """
    system_instruction = "You are Shrishti AI, a helpful, accurate, and concise assistant for Hind search engine."
    full_prompt = f"{system_instruction}\n\nUser Question:\n{prompt}"

    # Determine provider based on key format (Groq starts with 'gsk_', Gemini is standard)
    if api_key.startswith("gsk_"):
        # Groq endpoint
        endpoint = "https://api.groq.com/openai/v1/chat/completions"
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1024,
            "temperature": 0.7
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "Hind-Search-Engine/1.0"
        }
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=req_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("choices") and len(data["choices"]) > 0:
                return data["choices"][0]["message"]["content"].strip()
            raise ValueError("Unexpected response structure from AI provider")
    else:
        # Default: Google Gemini REST API using header-based authentication
        endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": full_prompt}
                    ]
                }
            ],
            "generationConfig": {
                "maxOutputTokens": 1024,
                "temperature": 0.7
            }
        }
        # Secure: Pass API key via header 'x-goog-api-key' rather than in URL query parameters
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "Hind-Search-Engine/1.0"
        }
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=req_data, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                texts = [p.get("text", "") for p in parts if p.get("text")]
                if texts:
                    return "\n".join(texts).strip()
            raise ValueError("Empty or invalid candidate response from AI provider")

class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.end_headers()

    def do_GET(self):
        # Health check endpoint for /api/ai
        client_ip = get_client_ip(self)
        remaining = get_credits(client_ip)
        self._send_json(200, {
            "status": "active",
            "endpoint": "/api/ai",
            "credits_remaining": remaining,
            "credit_cost_per_query": CREDIT_COST
        })

    def do_POST(self):
        client_ip = get_client_ip(self)
        current_credits = get_credits(client_ip)

        # 1. Parse incoming JSON request
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body_bytes = self.rfile.read(content_length)
                body = json.loads(body_bytes.decode('utf-8'))
            else:
                body = {}
        except Exception:
            self._send_json(400, {
                "success": False,
                "error": "Invalid JSON in request body",
                "credits_remaining": current_credits
            })
            return

        message = str(body.get('message') or body.get('prompt') or '').strip()
        context = str(body.get('context') or '').strip()

        if not message:
            self._send_json(400, {
                "success": False,
                "error": "Query message cannot be empty",
                "credits_remaining": current_credits
            })
            return

        # 2. Check credit balance (Minimum 5 credits required)
        if current_credits < CREDIT_COST:
            self._send_json(403, {
                "success": False,
                "error": "AI credits exhausted",
                "credits_remaining": current_credits
            })
            return

        # 3. Read server environment variable securely
        api_key = (os.environ.get('AI_API_KEY') or os.environ.get('GEMINI_API_KEY') or '').strip()
        if not api_key:
            # Server configuration error - credits are NOT consumed
            self._send_json(503, {
                "success": False,
                "error": "AI service is currently not configured on server (AI_API_KEY environment variable required)",
                "credits_remaining": current_credits
            })
            return

        # Prepare combined prompt with context if provided
        prompt_with_context = f"Context from search: {context}\n\nQuestion: {message}" if context else message

        # 4. Invoke AI provider
        try:
            answer = call_ai_provider(prompt_with_context, api_key)
            # Request succeeded: deduct 5 credits
            new_credits = deduct_credits(client_ip, CREDIT_COST)
            self._send_json(200, {
                "success": True,
                "answer": answer,
                "credits_remaining": new_credits
            })
        except urllib.error.HTTPError as http_err:
            # Failed request does NOT consume credits
            # Never expose API key or sensitive details in error output
            self._send_json(502, {
                "success": False,
                "error": "AI provider service error. Please try again shortly.",
                "credits_remaining": current_credits
            })
        except Exception:
            # Failed request does NOT consume credits
            self._send_json(502, {
                "success": False,
                "error": "Failed to connect to AI provider. Please try again.",
                "credits_remaining": current_credits
            })
