# TruthScope Extension - Backend

This directory contains the Python Flask backend server for the TruthScope Chrome Extension. It handles requests from the extension to analyze media (images, videos, audio) for potential AI generation or manipulation.

## Features

*   **Image Analysis:**
    *   Detects potential AI-generated images using the Sightengine API.
    *   Extracts text from images using the OCR.space API.
*   **Video Analysis:** (Paid Tier Required)
    *   Analyzes video properties using the Sightengine Video API.
    *   Detects potential scams within videos using the Sightengine Video API.
*   **Audio Analysis:** (Paid Tier Required)
    *   Detects potential AI-generated audio using a configurable third-party API (placeholder implementation included).
*   **User Authentication & Authorization:**
    *   Identifies users via Google User ID passed from the frontend.
    *   Checks user subscription tier (free/paid) stored in a PostgreSQL database.
    *   Restricts video and audio analysis to users with a 'paid' tier.
*   **Database Integration:**
    *   Uses PostgreSQL to store user information (Google ID, tier).
    *   Manages database connections using `psycopg2-binary` and a connection pool.
*   **Configuration:**
    *   Loads API keys and database credentials from a `.env` file.
*   **CORS Enabled:** Allows requests from the Chrome extension frontend.

## Setup

1.  **Prerequisites:**
    *   Python 3.8+
    *   PostgreSQL Database Server
2.  **Clone the repository (if not already done):**
    ```bash
    git clone <repository_url>
    cd <repository_directory>/extension/backend
    ```
3.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    # On Windows
    .\venv\Scripts\activate
    # On macOS/Linux
    source venv/bin/activate
    ```
4.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
5.  **Set up the Database:**
    *   Ensure your PostgreSQL server is running.
    *   Create a database (e.g., `news_analysis_db`).
    *   Create a user and grant privileges (e.g., `user` with `password`).
    *   Run the SQL script `db.sql` to create the necessary `users` table:
        ```bash
        psql -h <db_host> -p <db_port> -U <db_user> -d <db_name> -f db.sql
        ```
        (Replace placeholders with your actual database details).
6.  **Configure Environment Variables:**
    *   Create a `.env` file in the `extension/backend` directory.
    *   Copy the contents of `.env.example` (if provided) or add the following variables, replacing placeholder values with your actual credentials:

    ```dotenv
    # Sightengine API Credentials
    SIGHTENGINE_API_USER=YOUR_SIGHTENGINE_API_USER
    SIGHTENGINE_API_SECRET=YOUR_SIGHTENGINE_API_SECRET

    # OCR.space API Key
    OCR_SPACE_API_KEY=YOUR_OCR_SPACE_API_KEY

    # AI Audio API (Placeholder - Replace if using a real service)
    AI_AUDIO_API_KEY=YOUR_AI_AUDIO_API_KEY
    AI_AUDIO_API_URL=YOUR_AI_AUDIO_API_URL

    # Database Configuration
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=news_analysis_db
    DB_USER=user
    DB_PASSWORD=password

    # Flask Settings (Optional)
    # FLASK_DEBUG=True # For development, set to False in production
    # PORT=3000 # Default port if not set
    ```

## API Endpoints

*   **`GET /`**: Health check endpoint. Returns the status of the backend and database connection.
*   **`POST /analyze_image`**: Analyzes an image URL.
    *   **Request Body:** `{ "media_url": "image_url_here" }`
    *   **Response:** JSON object containing analysis results (AI detection confidence, extracted text). No authentication required.
*   **`POST /analyze_video`**: Analyzes a video URL.
    *   **Request Body:** `{ "media_url": "video_url_here", "google_user_id": "user_google_id_here" }`
    *   **Response:** JSON object containing analysis results (properties, scam detection). **Requires 'paid' user tier.**
*   **`POST /analyze_audio`**: Analyzes an audio URL.
    *   **Request Body:** `{ "media_url": "audio_url_here", "google_user_id": "user_google_id_here" }`
    *   **Response:** JSON object containing analysis results (AI generation detection). **Requires 'paid' user tier.**

*Authentication for `/analyze_video` and `/analyze_audio` is handled by passing the `google_user_id` in the request body. The backend verifies the user's tier in the database.*

## Running the Server

```bash
# Ensure your virtual environment is activated
# Ensure the .env file is configured

python check_media.py
```

The server will start (by default on `http://0.0.0.0:3000`). Use `Ctrl+C` to stop.

For production deployments, consider using a production-grade WSGI server like Gunicorn or Waitress behind a reverse proxy like Nginx.

## Dependencies

See `requirements.txt` for a full list of Python packages. Key dependencies include:

*   Flask
*   Flask-Cors
*   psycopg2-binary
*   requests
*   python-dotenv
