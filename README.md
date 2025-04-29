# TruthScope - Fake News Detection Suite

TruthScope is a comprehensive project aimed at combating misinformation online. It consists of a Chrome browser extension for real-time analysis of web content and a landing page.

## Project Components

1.  **Chrome Extension (`/extension`)**: Analyzes text and potentially media content on web pages to assess credibility.
    *   **Frontend (`/extension/frontend`)**: The user interface of the extension (popup, side panel) built with HTML, CSS, and JavaScript.
    *   **Backend (`/extension/backend`)**: A Python Flask server that performs the core analysis using AI models (like Google Gemini) and fact-checking APIs.
2.  **Landing Page (`/landing`)**: A Next.js application providing information about TruthScope, user accounts, and potentially dashboards.

## Features

### Extension
- 🔍 Real-time analysis of article text content.
- 🤖 AI-powered credibility assessment (using models like Gemini).
- 📊 Confidence scoring for analysis results.
- 📚 Integration with fact-checking databases and APIs (e.g., Google Fact Check Tools API, Google News search via ZenRows).
- 🌐 Checks against a database of known source domain verdicts.
- ✨ Highlights potentially misleading text segments directly on the webpage.
- 🎨 User-friendly interface (popup summary & detailed side panel) with theme support.
- 💾 Stores analysis results for reviewed pages.

### Landing Page
- Information about the TruthScope project.
- User authentication (Sign-in/Sign-up via Clerk).
- Potential for user dashboards and settings (structure exists).
- Built with Next.js, React, TypeScript, and Tailwind CSS.

## Technical Stack

- **Chrome Extension Frontend**: HTML, CSS, JavaScript (Manifest V3)
- **Chrome Extension Backend**: Python, Flask, Google Generative AI (Gemini), PostgreSQL, ZenRows API, Google Fact Check Tools API
- **Landing Page**: Next.js, React, TypeScript, Tailwind CSS, Shadcn/ui, Clerk (Authentication)

## Prerequisites

- **General**:
    - Git
    - Web Browser (Chrome recommended for the extension)
- **Extension Backend**:
    - Python 3.x
    - PostgreSQL Database Server
    - API Keys (Google AI, Google Fact Check, ZenRows)
- **Landing Page**:
    - Node.js (Check `.nvmrc` or `package.json` engines if available, otherwise use a recent LTS version)
    - pnpm package manager (`npm install -g pnpm`)

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd TruthScope
```

### 2. Set Up the Extension Backend (`/extension/backend`)

1.  **Navigate to the backend directory:**
    ```bash
    cd extension/backend
    ```
2.  **Create and activate a virtual environment:**
    ```bash
    python -m venv venv
    # On Windows
    .\venv\Scripts\activate
    # On macOS/Linux
    source venv/bin/activate
    ```
3.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
4.  **Set up the PostgreSQL Database:**
    *   Ensure your PostgreSQL server is running.
    *   Create a database (e.g., `truthscope_db`).
    *   Create a user with privileges on that database.
    *   Connect to the database and execute the SQL commands in `extension/backend/db.sql` to create the `url_verdicts` and `analysis_results` tables.
    *   *(Optional)* Populate the `url_verdicts` table with known reliable/unreliable source domains.
5.  **Configure Environment Variables:**
    *   Create a `.env` file in the `extension/backend` directory.
    *   Add the following variables, replacing placeholders with your actual credentials:
      ```dotenv
      # API Keys
      GOOGLE_API_KEY=YOUR_GOOGLE_GENERATIVE_AI_API_KEY
      GOOGLE_FACT_CHECK_API_KEY=YOUR_GOOGLE_FACT_CHECK_API_KEY
      ZENROWS_API_KEY=YOUR_ZENROWS_API_KEY
      # NEWS_API_KEY=YOUR_NEWS_API_KEY # Currently unused but defined

      # Database Credentials
      DB_HOST=localhost # Or your DB host
      DB_PORT=5432      # Or your DB port
      DB_NAME=truthscope_db # Your database name
      DB_USER=your_db_user     # Your database user
      DB_PASSWORD=your_db_password # Your database password
      ```

### 3. Set Up the Landing Page (`/landing`)

1.  **Navigate to the landing page directory:**
    ```bash
    cd ../../landing # Assuming you are in extension/backend
    # Or from the root: cd landing
    ```
2.  **Install Node.js dependencies:**
    ```bash
    pnpm install
    ```
3.  **Configure Environment Variables:**
    *   Create a `.env.local` file in the `landing` directory.
    *   Add necessary environment variables, especially for Clerk authentication. Refer to Clerk documentation for required keys (e.g., `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).
      ```dotenv
      # Clerk Authentication
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
      CLERK_SECRET_KEY=sk_test_...

      NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
      NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
      ```

### 4. Load the Chrome Extension (`/extension/frontend`)

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable "Developer mode" (usually a toggle in the top right corner).
3.  Click "Load unpacked".
4.  Select the `extension/frontend` directory within your cloned `TruthScope` project folder.
5.  The TruthScope extension icon should appear in your Chrome toolbar. *Note: The extension requires the backend server to be running for analysis.*

## Running the Project

1.  **Start the Extension Backend:**
    *   Ensure your backend virtual environment is activated (`source venv/bin/activate` or `.\venv\Scripts\activate`).
    *   Navigate to the `extension/backend` directory.
    *   Run the Flask server:
      ```bash
      python check_text.py
      ```
    *   The backend will typically run on `http://127.0.0.1:5000`. Check the console output.

2.  **Start the Landing Page:**
    *   Navigate to the `landing` directory.
    *   Run the Next.js development server:
      ```bash
      pnpm dev
      ```
    *   The landing page will typically be available at `http://localhost:3000`.

## Usage (Chrome Extension)

1.  **Navigate**: Go to a news article or webpage you want to analyze.
2.  **Automatic Analysis**: The extension's content script (`content.js`) attempts to automatically detect and send the article text to the running backend for analysis upon page load.
3.  **View Summary**: Click the TruthScope icon in your Chrome toolbar to see a quick summary (credibility indicator) in the popup.
4.  **View Details**: Click the "View Details" button in the popup to open the side panel, which displays:
    *   Overall credibility assessment (e.g., "Potential Misinformation", "Likely Credible").
    *   Confidence score.
    *   AI-generated reasoning.
    *   Fact-checking results and related news.
    *   Highlighted questionable text segments (also shown directly on the page).
5.  **Highlights**: Look for text highlighted directly on the webpage (often with a yellow background), indicating potentially misleading segments identified by the analysis.

## Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

Please ensure your code adheres to existing style conventions and includes tests where applicable.

## License

This project is licensed under the MIT License - see the `LICENSE` file (if one exists) for details. *(Note: A LICENSE file was not listed in the provided structure, consider adding one)*.

## Acknowledgments

- Google Generative AI (Gemini)
- Google Fact Check Tools API
- ZenRows API
- Flask Web Framework
- Next.js Framework
- Shadcn/ui Components
- Clerk Authentication
- Various open-source libraries used (see `requirements.txt` and `package.json`).
