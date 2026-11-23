# LabelKit: web UI + API in one small image.
#   docker build -t labelkit .
#   docker run -p 8000:8000 -v labelkit-data:/data labelkit
FROM python:3.12-slim

# Everything that must survive a restart lives in /data (mount a volume there):
# the SQLite database, uploaded images and thumbnails.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LABELKIT_DB=/data/labelkit.db \
    LABELKIT_UPLOAD_DIR=/data/uploads \
    LABELKIT_CONTAINER=1

WORKDIR /app

# Install dependencies first so this layer is cached until requirements.txt changes
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Only what the app needs at runtime (see .dockerignore for what is left out)
COPY backend backend
COPY css css
COPY js js
COPY *.html ./

# Do not run as root
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin labelkit \
    && mkdir /data \
    && chown labelkit /data
USER labelkit
VOLUME /data

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

# --lan: listen on all interfaces (required inside a container; who can reach it is decided by the port mapping)
CMD ["python", "backend/app.py", "--lan", "--no-browser"]
