# TruthScope Project

TruthScope is a web application and Chrome extension designed to help users identify potentially AI-generated or manipulated media (images, video, audio) encountered online.

## Components

This repository contains two main parts:

1.  **`extension/`**: The Chrome Extension
    *   **`extension/frontend/`**: Contains the HTML, CSS, and JavaScript for the extension's user interface (popup, content scripts, background script, side panel). See `extension/frontend/README.md` for details.
    *   **`extension/backend/`**: A Python Flask server that handles the actual media analysis by communicating with third-party APIs (Sightengine, OCR.space, etc.) and manages user authentication/authorization via a PostgreSQL database. See `extension/backend/README.md` for details.
2.  **`landing/`**: The Landing Page & Web Application
    *   A Next.js application serving as the project's landing page.
    *   Provides information about TruthScope.
    *   Includes user authentication (likely using a service like Clerk or NextAuth).
    *   Features a dashboard for registered users, potentially allowing them to manage their subscription (free/paid tiers) which affects access to advanced features in the *extension*.
    *   Built with React, TypeScript, Tailwind CSS, and Shadcn UI components.

## Core Functionality

*   **Media Detection (Extension):** The Chrome extension allows users to right-click on media (or use the popup) to initiate an analysis.
*   **Backend Analysis (Extension Backend):** The request is sent to the Flask backend, which calls relevant APIs:
    *   **Images:** Checked for AI generation (Sightengine) and text content (OCR.space).
    *   **Video/Audio (Paid Tier):** Checked for potential manipulation/scams (Sightengine Video) or AI generation (placeholder audio API).
*   **User Tiers (Backend & Landing Page):** The backend checks the user's tier (stored in PostgreSQL) before allowing access to video/audio analysis. Users manage their subscription through the Next.js landing page/dashboard.
*   **Results Display (Extension Frontend):** The analysis results (confidence scores, extracted text, warnings) are displayed back to the user via the extension's popup or side panel.

## Getting Started

To run the full project, you need to set up and run both the extension backend and the landing page application.

1.  **Set up the Extension Backend:** Follow the instructions in `extension/backend/README.md` (install Python dependencies, set up PostgreSQL, configure `.env`).
2.  **Set up the Landing Page:** Follow the instructions in `landing/README.md` (or standard Next.js setup: install Node.js/pnpm, install dependencies (`pnpm install`), configure environment variables for authentication/database if needed).
3.  **Run the Backend:** Start the Flask server (`python extension/backend/check_media.py`).
4.  **Run the Landing Page:** Start the Next.js development server (`pnpm dev` in the `landing/` directory).
5.  **Load the Extension:** Load the unpacked extension from the `extension/frontend/` directory into Chrome (`chrome://extensions`).

## Project Structure Overview

```
/
├── extension/
│   ├── backend/      # Python Flask server (API, DB)
│   │   ├── check_media.py
│   │   ├── requirements.txt
│   │   ├── db.sql
│   │   └── README.md
│   └── frontend/     # Chrome Extension UI (HTML, JS, CSS)
│       ├── manifest.json
│       ├── popup.js
│       ├── background.js
│       └── README.md
├── landing/          # Next.js Landing Page & Dashboard
│   ├── app/          # Next.js App Router pages
│   ├── components/   # React components
│   ├── public/       # Static assets
│   ├── package.json
│   └── README.md     # (Should exist or be created)
└── README.md         # This file (Overall Project Overview)
```

Refer to the README files within each subdirectory (`extension/backend`, `extension/frontend`, `landing`) for more specific details on setup, configuration, and usage.
