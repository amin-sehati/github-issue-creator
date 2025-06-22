from http.server import BaseHTTPRequestHandler
import json
import os
import httpx
import re

# Environment variables
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")


class handler(BaseHTTPRequestHandler):

    def validate_repo_name(self, repo):
        """Validate GitHub repository name format"""
        if not repo or not isinstance(repo, str):
            return False, "Repository name is required"

        # GitHub repo format: owner/repo
        if not re.match(r"^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$", repo):
            return False, "Invalid repository format. Use 'owner/repo' format"

        if len(repo) > 100:
            return False, "Repository name too long"

        return True, None

    def validate_issue_title(self, title):
        """Validate issue title"""
        if not title or not isinstance(title, str):
            return False, "Issue title is required"

        title = title.strip()
        if len(title) < 1:
            return False, "Issue title cannot be empty"

        if len(title) > 256:
            return False, "Issue title too long (max 256 characters)"

        # Basic XSS prevention
        if "<script" in title.lower() or "javascript:" in title.lower():
            return False, "Invalid characters in title"

        return True, None

    def validate_issue_body(self, body):
        """Validate issue body"""
        if body is None:
            body = ""

        if not isinstance(body, str):
            return False, "Issue body must be a string"

        if len(body) > 65536:  # 64KB limit
            return False, "Issue body too long (max 65536 characters)"

        return True, None

    def validate_access_token(self, token):
        """Basic access token validation"""
        if not token or not isinstance(token, str):
            return False, "Access token is required"

        # GitHub tokens are typically 40 characters for classic tokens
        # or start with 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_' for fine-grained tokens
        if not (
            re.match(r"^[a-f0-9]{40}$", token)
            or re.match(r"^gh[a-z]_[A-Za-z0-9_]{36,255}$", token)
        ):
            return False, "Invalid access token format"

        return True, None

    def get_cors_origin(self):
        """Get allowed CORS origin based on request origin"""
        request_origin = self.headers.get("Origin", "")

        # Check if request origin is in allowed origins
        for allowed_origin in ALLOWED_ORIGINS:
            if request_origin == allowed_origin.strip():
                return request_origin

        # Default to first allowed origin if no match
        return ALLOWED_ORIGINS[0].strip()

    def do_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", self.get_cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", self.get_cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api":
            self.do_response(
                200,
                {
                    "message": "GitHub OAuth API is running",
                    "env_status": {
                        "github_client_id": "Set" if GITHUB_CLIENT_ID else "NOT SET",
                        "github_client_secret": (
                            "Set" if GITHUB_CLIENT_SECRET else "NOT SET"
                        ),
                    },
                },
            )
        else:
            self.do_response(404, {"error": "Not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = (
            self.rfile.read(content_length).decode("utf-8")
            if content_length > 0
            else "{}"
        )

        try:
            data = json.loads(body)
        except:
            self.do_response(400, {"detail": "Invalid JSON"})
            return

        if self.path == "/api/oauth/token":
            self.handle_oauth_token(data)
        elif self.path == "/api/create-issue":
            self.handle_create_issue(data)
        else:
            self.do_response(404, {"error": "Not found"})

    def handle_oauth_token(self, data):
        """Exchange OAuth code for access token"""
        code = data.get("code")
        redirect_uri = data.get("redirect_uri")

        # Input validation
        if not code or not isinstance(code, str) or len(code) > 100:
            self.do_response(400, {"detail": "Invalid authorization code"})
            return

        if (
            not redirect_uri
            or not isinstance(redirect_uri, str)
            or len(redirect_uri) > 500
        ):
            self.do_response(400, {"detail": "Invalid redirect URI"})
            return

        if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
            self.do_response(500, {"detail": "GitHub OAuth credentials not configured"})
            return

        try:
            # Make synchronous request to GitHub
            response = httpx.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={
                    "Accept": "application/json",
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                self.do_response(
                    400, {"detail": f"GitHub OAuth error: {response.text}"}
                )
                return

            token_data = response.json()

            if "access_token" not in token_data:
                error_msg = token_data.get(
                    "error_description",
                    token_data.get("error", "No access token received"),
                )
                self.do_response(400, {"detail": f"GitHub OAuth error: {error_msg}"})
                return

            self.do_response(200, {"access_token": token_data["access_token"]})

        except Exception as e:
            self.do_response(500, {"detail": f"Server error: {str(e)}"})

    def handle_create_issue(self, data):
        """Create a GitHub issue"""
        access_token = data.get("access_token")
        repo = data.get("repo")
        title = data.get("title")
        body_text = data.get("body", "")

        # Input validation
        is_valid, error_msg = self.validate_access_token(access_token)
        if not is_valid:
            self.do_response(400, {"detail": error_msg})
            return

        is_valid, error_msg = self.validate_repo_name(repo)
        if not is_valid:
            self.do_response(400, {"detail": error_msg})
            return

        is_valid, error_msg = self.validate_issue_title(title)
        if not is_valid:
            self.do_response(400, {"detail": error_msg})
            return

        is_valid, error_msg = self.validate_issue_body(body_text)
        if not is_valid:
            self.do_response(400, {"detail": error_msg})
            return

        try:
            response = httpx.post(
                f"https://api.github.com/repos/{repo}/issues",
                json={
                    "title": title.strip(),
                    "body": body_text,
                },
                headers={
                    "Authorization": f"token {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "GitHub-Issue-Creator",
                },
                timeout=30.0,
            )

            if response.status_code == 201:
                issue_data = response.json()
                self.do_response(
                    200,
                    {
                        "success": True,
                        "number": issue_data["number"],
                        "url": issue_data["html_url"],
                        "title": issue_data["title"],
                    },
                )
            else:
                self.do_response(
                    response.status_code,
                    {"detail": f"GitHub API error: {response.text}"},
                )

        except Exception as e:
            self.do_response(500, {"detail": f"Server error: {str(e)}"})
