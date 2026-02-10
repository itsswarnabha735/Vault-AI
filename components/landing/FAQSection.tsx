'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const faqs = [
  {
    question: 'How is my data kept private?',
    answer:
      "Your documents never leave your device. All processing—OCR, text extraction, AI embeddings, and search—happens locally in your browser using WebAssembly and on-device machine learning. Only sanitized accounting data (amounts, vendors, dates) can optionally sync to the cloud, and that's end-to-end encrypted. We literally cannot see your receipts or financial documents.",
  },
  {
    question: 'Does it work offline?',
    answer:
      "Yes! Since everything runs locally, Vault-AI works perfectly without an internet connection. You can import documents, search your vault, and even use the AI chat—all offline. When you reconnect, any changes sync automatically if you've enabled cloud sync.",
  },
  {
    question: 'What file types are supported?',
    answer:
      'We support PDF documents, images (JPG, PNG, HEIC, WebP), and plain text files. Our OCR engine can extract text from scanned documents and photos of receipts. For best results, ensure receipts are well-lit and in focus.',
  },
  {
    question: 'How does the AI work without seeing my data?',
    answer:
      "We use on-device machine learning models that run entirely in your browser. For search, we generate semantic embeddings locally using a compact ML model. For the chat feature, we only send structured data (amounts, categories, dates) to the AI—never your raw documents or extracted text. Your privacy isn't compromised for AI features.",
  },
  {
    question: 'Can I export my data?',
    answer:
      'Absolutely. You can export all your data at any time in multiple formats: CSV for spreadsheets, JSON for developers, or PDF reports for sharing. Your original documents are always accessible from local storage. We believe in zero lock-in—your data is yours.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes, the free tier is genuinely free forever. You get up to 100 documents, full local storage, and basic search. We make money from Pro and Business subscriptions that add cloud sync, unlimited storage, and advanced AI features. No ads, no data selling, ever.',
  },
  {
    question: 'What happens if I cancel my subscription?',
    answer:
      "Your data remains on your device—we can't delete what we don't have. Cloud sync stops, but you keep everything stored locally. If you re-subscribe later, sync resumes. You can always export everything before canceling.",
  },
  {
    question: 'Is my synced data encrypted?',
    answer:
      'Yes, all cloud-synced data uses end-to-end encryption with keys derived from your credentials. Even our servers can only see encrypted blobs. For the technically curious, we use AES-256-GCM with PBKDF2-derived keys.',
  },
  {
    question: 'Can I use Vault-AI for business expenses?',
    answer:
      'Vault-AI is perfect for freelancers and small businesses. The Business plan adds features like multiple users, shared categories, and API access for integrations. Many accountants recommend us for our privacy-first approach and excellent export capabilities.',
  },
  {
    question: 'How do I get support?',
    answer:
      "Free users can access our community forums and documentation. Pro users get email support with 24-hour response time. Business users get priority support with dedicated account managers. We're committed to helping you succeed with Vault-AI.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-vault-bg-secondary py-20">
      <div className="mx-auto max-w-3xl px-4">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 font-display text-3xl font-bold sm:text-4xl">
            Frequently Asked
            <br />
            <span className="text-vault-gold">Questions</span>
          </h2>
          <p className="text-lg text-vault-text-secondary">
            Everything you need to know about Vault-AI
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.10)] bg-vault-bg-elevated"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
            >
              <button
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-vault-bg-surface"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="font-medium">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-5 w-5 shrink-0 text-vault-text-secondary" />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-6 pb-4 leading-relaxed text-vault-text-secondary">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* Still have questions */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <p className="mb-4 text-vault-text-secondary">
            Still have questions?
          </p>
          <Button variant="outline" asChild>
            <a
              href="mailto:support@vault-ai.app"
              className="inline-flex items-center gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Contact Support
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
