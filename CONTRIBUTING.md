# Contributing to Vault AI

Thank you for your interest in contributing to Vault AI! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/vault-ai.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `privacy/description` - Privacy-related changes

### Commit Messages

Follow this format:

```
type(scope): description

Examples:
- feat(chat): add citation system for AI responses
- fix(vault): correct transaction date parsing
- privacy(sync): ensure embeddings never transmitted
- refactor(storage): improve IndexedDB performance
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding tests
- `docs`: Documentation
- `privacy`: Privacy-related changes

## Privacy Rules

**CRITICAL:** The following privacy rules must NEVER be violated:

1. **No Document Uploads**: Documents stay in OPFS only
2. **No Raw Text in Cloud**: Never sync `rawText` to cloud
3. **No Embeddings in Cloud**: Embeddings stay in IndexedDB only
4. **Privacy-Safe LLM Prompts**: Only use structured data

See `.cursor/rules/Vault-AI-Rules.mdc` for complete privacy guidelines.

## Code Style

### TypeScript

- Use strict mode always
- No `any` type - use `unknown` with type guards
- Prefer interfaces over types for objects
- Use branded types for IDs

### React Components

- Use functional components with hooks
- Place hooks at the top of the component
- Use descriptive prop names with JSDoc
- Implement proper error boundaries

### File Organization

- Components: PascalCase (`TransactionCard.tsx`)
- Hooks: camelCase with `use` prefix (`useTransactions.ts`)
- Utilities: camelCase (`formatCurrency.ts`)
- Types: PascalCase (`LocalTransaction`)

## Testing

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Privacy tests (must pass!)
npm run test:privacy

# Test coverage
npm run test:coverage
```

### Test Requirements

- Unit tests: > 80% coverage for `lib/`
- All privacy tests must pass
- E2E tests for critical user flows

## Pull Request Process

### Before Submitting

Ensure your PR meets these requirements:

- [ ] TypeScript strict mode passes
- [ ] ESLint passes (`npm run lint`)
- [ ] Privacy tests pass (`npm run test:privacy`)
- [ ] Unit tests pass (`npm run test`)
- [ ] No sensitive data logged
- [ ] Loading states implemented
- [ ] Error handling complete
- [ ] Accessibility checked (keyboard navigation, ARIA labels)
- [ ] Mobile responsive
- [ ] Documentation updated

### PR Template

When creating a PR, include:

1. **Description**: What does this PR do?
2. **Motivation**: Why is this change needed?
3. **Testing**: How was this tested?
4. **Screenshots**: For UI changes
5. **Privacy Impact**: Does this affect data handling?

### Review Process

1. At least one approval required
2. All tests must pass
3. No merge conflicts
4. Privacy tests must pass (critical!)

## Project Structure

```
vault-ai/
├── app/                  # Next.js App Router pages
├── components/           # React components
├── lib/                  # Core libraries
│   ├── ai/              # AI/ML services
│   ├── storage/         # Database & file storage
│   ├── sync/            # Sync logic
│   ├── processing/      # Document processing
│   └── utils/           # Utilities
├── hooks/               # Custom React hooks
├── stores/              # Zustand stores
├── types/               # TypeScript types
└── workers/             # Web Workers
```

## Common Tasks

### Adding a New Component

1. Create component file in appropriate directory
2. Export from index file if needed
3. Add tests
4. Update documentation

### Adding a New Hook

1. Create hook in `hooks/` directory
2. Follow naming convention: `use[Feature].ts`
3. Add JSDoc documentation
4. Add tests

### Adding a New Type

1. Add to `types/index.ts`
2. Use branded types for IDs
3. Document with JSDoc comments

## Questions?

If you have questions:

1. Check existing issues
2. Review documentation
3. Create a new issue with the `question` label

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Vault AI! Your help in maintaining privacy-first principles is appreciated.
