# Presenter AI

A NodeJS application that automatically transforms articles into complete presentations with synchronized narration audio.

## Features

- Converts articles into presentation slides with bullet points
- Generates narration scripts for each slide
- Creates audio narrations using Google Cloud Text-to-Speech
- Synchronizes slides with their corresponding narrations
- Outputs a complete presentation package ready for use

## Prerequisites

- Node.js 14.x or higher
- Google Cloud Platform account with Text-to-Speech API enabled
- Service account credentials with permissions for Text-to-Speech API

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd presenter-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Google Cloud credentials:
   - Create a service account on Google Cloud Platform
   - Download the service account key JSON file
   - Set the environment variable:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=path/to/your-service-account-key.json
     ```
   - Alternatively, create a `.env` file in the project root:
     ```
     GOOGLE_APPLICATION_CREDENTIALS=path/to/your-service-account-key.json
     AI_SDK_API_KEY=your_api_key_here
     ```

## Usage

### Basic usage

Run the example script to see the full process:

```bash
node example.js
```

This will:
1. Generate slide content and narration from the example article
2. Create audio files for each narration
3. Save all presentation data to `presentation_data.json`

### Use in your own project

```javascript
const { run } = require('./presenter.js');

// Your article text
const articleText = `
# Your Article Title

Your article content goes here...
`;

// Generate the presentation
(async () => {
  try {
    const result = await run(articleText);
    console.log(`Generated presentation with ${result.length} slides.`);
  } catch (error) {
    console.error("Error:", error);
  }
})();
```

## Output

The script generates:

1. A folder named `narrations/` containing MP3 audio files for each slide
2. A JSON file (`presentation_data.json`) with the complete presentation data:
   ```json
   [
     {
       "slide_number": 1,
       "slide_content": "# Slide Title\n- Bullet point 1\n...",
       "narration_text": "Full narration text for this slide...",
       "narration_mp3_path": "path/to/audio/file.mp3",
       "narration_duration_seconds": 15.23
     },
     ...
   ]
   ```

## Advanced Configuration

You can customize the narration options:

```javascript
const { generateNarrations } = require('./presenter.js');

const options = {
  batchSize: 2, // Number of parallel TTS requests
  outputDir: "custom-narrations", // Custom output directory
  voiceLanguage: "en-US", 
  voiceName: "en-US-Chirp3-HD-Puck", // Different voice model
};

const enhancedContent = await generateNarrations(synchronizedContent, options);
```

## Dependencies

- @ai-sdk/google: For Google's AI models
- ai: For text generation
- zod: For schema validation
- dotenv: For environment variables
- @google-cloud/text-to-speech: For creating narration audio
- mp3-duration: For calculating audio durations

## License

MIT 