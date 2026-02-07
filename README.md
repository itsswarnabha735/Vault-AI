# Vault AI

A privacy-first personal finance application using a "Local-First" architecture. The browser acts as both UI and application server, with intelligence (ML models, vector search) running entirely on the user's device.

## 🔒 Privacy-First Architecture

**Core Principle:** Raw documents, text content, and embeddings NEVER leave the user's device. Only sanitized accounting data (amounts, vendors, dates) syncs to the cloud.

## 🚀 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.x (Strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** Zustand + TanStack Query
- **Local Database:** Dexie.js (IndexedDB)
- **File Storage:** OPFS (Origin Private File System)
- **Vector Search:** Custom cosine similarity with HNSW
- **Embeddings:** Transformers.js (all-MiniLM-L6-v2)
- **LLM:** Google Gemini API
- **OCR:** Tesseract.js
- **PDF Parsing:** PDF.js
- **Cloud Backend:** Supabase (PostgreSQL + Auth)
- **Testing:** Vitest + Playwright

## 📁 Project Structure

```
vault-ai/
├── app/                      # Next.js App Router pages
│   ├── (auth)/              # Auth-related pages (grouped)
│   │   ├── login/           # Login page
│   │   └── callback/        # Auth callback
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── vault/           # Vault (transactions & documents)
│   │   ├── chat/            # AI chat interface
│   │   └── settings/        # User settings
│   ├── api/                 # API routes
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── ui/                  # shadcn/ui components
│   └── shared/              # Shared components
├── lib/                     # Core libraries
│   ├── ai/                  # AI/ML services
│   ├── storage/             # Database and file storage
│   ├── sync/                # Synchronization logic
│   ├── processing/          # Document processing
│   └── utils/               # Utility functions
├── hooks/                   # Custom React hooks
├── stores/                  # Zustand stores
├── types/                   # TypeScript type definitions
├── workers/                 # Web Workers for CPU-intensive tasks
├── next.config.mjs          # Next.js configuration
├── tsconfig.json            # TypeScript configuration
└── tailwind.config.ts       # Tailwind CSS configuration
```

## 🛠️ Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/vault-ai.git
cd vault-ai
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your credentials:

- Supabase URL and keys
- Google Gemini API key (for LLM features)

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔑 Environment Variables

See `.env.local.example` for required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Your Supabase publishable key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (server-side only)
- `GOOGLE_GEMINI_API_KEY` - Your Google Gemini API key (server-side only)

## 🏗️ Development

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Privacy tests (critical)
npm run test:privacy
```

### Building for Production

```bash
npm run build
npm run start
```

### Linting

```bash
npm run lint
```

## 🔐 Privacy Rules

**CRITICAL:** The following rules must NEVER be violated:

1. **No Document Uploads**: Documents are stored locally in OPFS only
2. **No Raw Text in Cloud**: Never sync `rawText` field to Supabase
3. **No Embeddings in Cloud**: Embeddings stay in IndexedDB only
4. **Privacy-Safe LLM Prompts**: Only use structured data in prompts

See `.cursor/rules/Vault-AI-Rules.mdc` for complete privacy guidelines.

## 📚 Documentation

- [Technical Architecture](./docs/architecture.md) (Coming soon)
- [API Documentation](./docs/api.md) (Coming soon)
- [Contributing Guide](./CONTRIBUTING.md) (Coming soon)

## 🧪 Testing

All PRs must pass privacy tests before merging:

```bash
npm run test:privacy
```

Test coverage requirements:

- Unit tests: > 80% coverage for `lib/`
- Integration tests: All user flows
- E2E tests: Critical paths
- Privacy tests: 100% coverage for data transmission

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) first.

### Before Submitting a PR

- [ ] TypeScript strict mode passes
- [ ] ESLint passes
- [ ] Privacy tests pass
- [ ] Unit tests pass
- [ ] No sensitive data logged
- [ ] Loading states implemented
- [ ] Error handling complete
- [ ] Accessibility checked
- [ ] Mobile responsive
- [ ] Documentation updated

## 📄 License

[MIT License](./LICENSE)

## 🙏 Acknowledgments

- Next.js team for the amazing framework
- Supabase for the backend infrastructure
- Transformers.js for on-device ML
- All open-source contributors

---

**Remember: When in doubt about privacy, err on the side of caution. Never transmit user documents or raw text.**
