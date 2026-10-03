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

def detect_provider(api_key):
    cleaned = api_key.strip().strip('"').strip("'")
    if cleaned.startswith("sk-or-"):
        return "OpenRouter", cleaned
    elif cleaned.startswith("gsk_"):
        return "Groq", cleaned
    elif cleaned.startswith("mstrl_"):
        return "Mistral", cleaned
    return "Google Gemini", cleaned

def call_ai_provider(prompt, raw_key):
    """
    Calls the configured server-side AI provider based on key format.
    The API key is kept strictly within this server-side execution.
    """
    provider_name, api_key = detect_provider(raw_key)
    system_instruction = "You are Shrishti AI, a helpful, accurate, and concise assistant for Hind search engine."
    full_prompt = f"{system_instruction}\n\nUser Question:\n{prompt}"

    if provider_name == "OpenRouter":
        # OpenRouter endpoint with active models
        endpoint = "https://openrouter.ai/api/v1/chat/completions"
        models_to_try = [
            "google/gemini-2.0-flash-exp:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "mistralai/mistral-7b-instruct:free"
        ]
        last_error = None
        for model_id in models_to_try:
            try:
                payload = {
                    "model": model_id,
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
                    "HTTP-Referer": "https://hind.com",
                    "X-Title": "Hind Search Engine",
                    "User-Agent": "Hind-Search-Engine/1.0"
                }
                req_data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(endpoint, data=req_data, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("choices") and len(data["choices"]) > 0:
                        return data["choices"][0]["message"]["content"].strip()
            except urllib.error.HTTPError as he:
                last_error = he
                if he.code != 404:
                    raise he
            except Exception as e:
                last_error = e
        if last_error:
            raise last_error
        raise ValueError("Failed to get response from OpenRouter")

    elif provider_name == "Groq":
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
            raise ValueError("Unexpected response structure from Groq")

    elif provider_name == "Mistral":
        endpoint = "https://api.mistral.ai/v1/chat/completions"
        payload = {
            "model": "mistral-small-latest",
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
            raise ValueError("Unexpected response structure from Mistral")

    else:
        # Google Gemini: Try 1.5-flash first, fallback to 2.0-flash / 2.5-flash / gemini-flash-latest
        gemini_models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-flash-latest"]
        last_err = None

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
        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "Hind-Search-Engine/1.0"
        }

        for model_name in gemini_models:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            req = urllib.request.Request(endpoint, data=req_data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates") or []
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        texts = [p.get("text", "") for p in parts if p.get("text")]
                        if texts:
                            return "\n".join(texts).strip()
            except urllib.error.HTTPError as he:
                last_err = he
                if he.code != 404:
                    raise he
            except Exception as e:
                last_err = e

        if last_err:
            raise last_err
        raise ValueError("Empty or invalid candidate response from Gemini")

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
        raw_key = (os.environ.get('AI_API_KEY') or os.environ.get('GEMINI_API_KEY') or '').strip()
        if not raw_key:
            self._send_json(503, {
                "success": False,
                "error": "AI service is currently not configured on server (AI_API_KEY environment variable required in Vercel)",
                "credits_remaining": current_credits
            })
            return

        provider_name, _ = detect_provider(raw_key)
        prompt_with_context = f"Context from search: {context}\n\nQuestion: {message}" if context else message

        # 4. Invoke AI provider
        try:
            answer = call_ai_provider(prompt_with_context, raw_key)
            new_credits = deduct_credits(client_ip, CREDIT_COST)
            self._send_json(200, {
                "success": True,
                "answer": answer,
                "credits_remaining": new_credits
            })
        except urllib.error.HTTPError as http_err:
            err_body = ""
            try:
                err_body = http_err.read().decode('utf-8', errors='ignore')
            except Exception:
                pass
            print(f"[{provider_name} Error] Code: {http_err.code}, Reason: {http_err.reason}, Body: {err_body}")

            detail = ""
            try:
                parsed = json.loads(err_body)
                if isinstance(parsed, dict):
                    err_field = parsed.get("error") or parsed.get("detail")
                    if isinstance(err_field, dict):
                        detail = err_field.get("message") or str(err_field)
                    elif isinstance(err_field, str):
                        detail = err_field
                    elif "message" in parsed:
                        detail = parsed["message"]
            except Exception:
                pass

            if not detail:
                detail = http_err.reason or err_body[:200]

            err_msg = f"{provider_name} returned HTTP {http_err.code}: {detail}"

            self._send_json(502, {
                "success": False,
                "error": err_msg,
                "credits_remaining": current_credits
            })
        except Exception as e:
            print(f"[{provider_name} Server Error] {str(e)}")
            self._send_json(502, {
                "success": False,
                "error": f"Failed to connect to {provider_name}: {str(e)}",
                "credits_remaining": current_credits
            })
