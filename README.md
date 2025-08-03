# Gaia Circle (Ears)

An intelligent real-time speech transcription and conversation assistant that listens to conversations and provides contextual help through AI-powered insights.

## Features

- **Real-time Speech Transcription**: Speech-to-text via remote Parakeet API service (with local option available)
- **Voice Activity Detection**: Intelligent detection of speech vs. silence
- **AI-Powered Assistance**: Automatically generates three types of helpful responses:
  - **Questions**: Immediate answers to factual questions from AI knowledge
  - **Search**: Real-time web search for current information via Tavily API
  - **Visual**: AI-generated images for visual/imaginative content via Replicate
- **Privacy-First**: Speech processing runs locally in the browser
- **Self-Hostable**: Easy deployment with Docker and Cloudron support

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Radix UI
- **Backend**: Node.js, Express, tRPC
- **Speech Processing**: Parakeet API (remote) or Hugging Face Transformers.js (local), Web Audio API
- **AI Services**: OpenRouter (Qwen), Tavily (search), Replicate (image generation)
- **Deployment**: Docker, Cloudron

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- API keys for OpenRouter, Tavily, and Replicate

### Environment Setup

Create a `.env` file in the `app` directory:

```env
OPENROUTER_API_KEY=your_openrouter_key
TAVILY_API_KEY=your_tavily_key
REPLICATE_API_TOKEN=your_replicate_token
```

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at `http://localhost:5173` with the API server on `http://localhost:2022`.

### Production Deployment

#### Docker
```bash
docker build -t gaia-circle .
docker run -p 80:80 gaia-circle
```

#### Cloudron
Deploy directly using the included `CloudronManifest.json`.

## How It Works

1. **Audio Capture**: Captures microphone input using Web Audio API
2. **Voice Detection**: Uses VAD to identify speech segments locally
3. **Audio Transcription**: Sends WAV audio to remote Parakeet API service at `transcribe.halecraft.org`
4. **AI Analysis**: Analyzes conversation context with AI to identify opportunities
5. **Contextual Assistance**: Provides relevant answers, searches, or visual content

## Privacy & Security

- Voice activity detection happens locally in your browser
- Audio data is sent to external Parakeet transcription service (`transcribe.halecraft.org`)
- Transcribed text is then sent to AI services for analysis
- Self-hostable for complete data control (though transcription uses external service)
- No persistent storage of conversations
- Local transcription option available but not currently used

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

This is an open-source project. Contributions are welcome!

## Author

Created by Duane Johnson and the Gaia Circle team.
