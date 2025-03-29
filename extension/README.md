# Fake News Detection Chrome Extension

A Chrome extension that helps users identify potential fake news and misinformation by analyzing text content using machine learning and fact-checking APIs.

## Features

- 🔍 Real-time text analysis
- 🤖 BERT-based fake news detection
- 📚 Integration with Google Fact Check API
- 🔔 Desktop notifications for important findings
- 🎨 Modern, user-friendly interface
- ⚡ Real-time text selection analysis
- 📊 Confidence scoring for analysis results

## Technical Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Python (Flask)
- **ML Model**: BERT-based fake news detection model
- **APIs**: Google Fact Check API
- **Browser Extension**: Chrome Extension Manifest V3

## Prerequisites

- Python 3.7 or higher
- Chrome browser
- Google Fact Check API key

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd fake-news-detection-Chrome-Extension
```

### 2. Set Up the Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment (optional but recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install required packages:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory with your API key:
```
GOOGLE_FACT_CHECK_API_KEY=your_api_key_here
```

5. Start the backend server:
```bash
python app.py
```

The backend will run on `http://127.0.0.1:5000`

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the extension directory
4. The extension icon should appear in your Chrome toolbar

## Usage

1. **Text Selection**:
   - Navigate to any webpage
   - Select the text you want to analyze
   - The extension will automatically detect the selection

2. **Analysis**:
   - Click the extension icon in your Chrome toolbar
   - Click the "Analyze Text" button
   - Wait for the analysis to complete

3. **Results**:
   - View the analysis results in the popup window
   - Check the confidence score
   - Review fact-check sources
   - Receive desktop notifications for important findings

## Extension Components

### 1. Popup (popup.html + popup.js)
- Provides the user interface
- Handles user interactions
- Displays analysis results
- Manages loading states

### 2. Background Script (background.js)
- Handles communication with the backend
- Manages extension state
- Creates desktop notifications
- Processes messages between components

### 3. Content Script (content.js)
- Monitors text selection on webpages
- Communicates with the background script
- Handles page-specific functionality

### 4. Backend (app.py)
- Processes text analysis requests
- Integrates with the BERT model
- Connects to Google Fact Check API
- Returns formatted results

## API Endpoints

### POST /check
Analyzes text for potential fake news.

**Request Body:**
```json
{
  "text": "Text to analyze"
}
```

**Response:**
```json
{
  "label": "LABEL_1" | "LABEL_0",
  "score": float,
  "fact_check": [
    {
      "title": "string",
      "source": "string"
    }
  ]
}
```

## Error Handling

The extension includes comprehensive error handling for:
- Connection issues
- API failures
- Invalid responses
- Network problems
- Missing text selection

## Security

- API keys are stored securely in environment variables
- HTTPS communication with external APIs
- Secure message passing between extension components
- No data storage on external servers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- BERT model by Google Research
- Google Fact Check API
- Flask web framework
- Chrome Extension APIs

## Support

For support, please open an issue in the repository or contact the maintainers.