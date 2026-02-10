'use client';

import { motion } from 'framer-motion';
import {
  Shield,
  Cloud,
  Check,
  Info,
  Lock,
  Eye,
  EyeOff,
  Database,
  FileText,
  Search,
  Key,
  Server,
} from 'lucide-react';

const localData = [
  { icon: FileText, text: 'Original documents (PDFs, images)' },
  { icon: FileText, text: 'Extracted text content' },
  { icon: Database, text: 'AI embeddings for search' },
  { icon: Search, text: 'Search queries' },
  { icon: Key, text: 'Encryption keys' },
];

const cloudData = [
  { icon: Info, text: 'Transaction amounts' },
  { icon: Info, text: 'Vendor names' },
  { icon: Info, text: 'Dates and categories' },
  { icon: Info, text: 'Budget settings' },
  { icon: Info, text: 'User preferences' },
];

export function PrivacySection() {
  return (
    <section id="privacy" className="bg-vault-bg-secondary py-20">
      <div className="mx-auto max-w-6xl px-4">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-vault-success-muted px-4 py-2 text-vault-success">
            <Shield className="h-5 w-5" />
            <span className="font-medium">Local-First Architecture</span>
          </div>
          <h2 className="mb-4 font-display text-3xl font-bold sm:text-4xl">
            Privacy That&apos;s Built In,
            <br />
            <span className="text-vault-gold">Not Bolted On</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-vault-text-secondary">
            We designed Vault-AI from the ground up with a simple principle:
            your sensitive data never leaves your device. Ever.
          </p>
        </motion.div>

        {/* Privacy Comparison */}
        <div className="mb-16 grid gap-8 md:grid-cols-2">
          {/* What Stays Local */}
          <motion.div
            className="rounded-xl border border-vault-success/30 bg-vault-bg-elevated p-6 sm:p-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-vault-success-muted">
                <Shield className="h-6 w-6 text-vault-success" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Stays on Your Device</h3>
                <p className="text-sm text-vault-text-secondary">
                  Never uploaded, never shared
                </p>
              </div>
            </div>

            <ul className="space-y-4">
              {localData.map((item, index) => (
                <motion.li
                  key={item.text}
                  className="group flex items-center gap-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vault-success-muted transition-transform group-hover:scale-110">
                    <Check className="h-4 w-4 text-vault-success" />
                  </div>
                  <span className="text-sm sm:text-base">{item.text}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-vault-success/20 bg-vault-success-muted p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-vault-success-text">
                <Lock className="h-4 w-4" />
                Protected by browser&apos;s Origin Private File System
              </div>
            </div>
          </motion.div>

          {/* What Syncs */}
          <motion.div
            className="rounded-xl border border-vault-info/30 bg-vault-bg-elevated p-6 sm:p-8"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-vault-info-muted">
                <Cloud className="h-6 w-6 text-vault-info" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">
                  Syncs to Cloud (Optional)
                </h3>
                <p className="text-sm text-vault-text-secondary">
                  Encrypted, minimal data only
                </p>
              </div>
            </div>

            <ul className="space-y-4">
              {cloudData.map((item, index) => (
                <motion.li
                  key={item.text}
                  className="group flex items-center gap-3"
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vault-info-muted transition-transform group-hover:scale-110">
                    <Info className="h-4 w-4 text-vault-info" />
                  </div>
                  <span className="text-sm sm:text-base">{item.text}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-vault-info/20 bg-vault-info-muted p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-vault-info-text">
                <Server className="h-4 w-4" />
                Sync is optional—works fully offline too
              </div>
            </div>
          </motion.div>
        </div>

        {/* Privacy Guarantees */}
        <motion.div
          className="grid gap-6 sm:grid-cols-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vault-danger-muted">
              <EyeOff className="h-8 w-8 text-vault-danger" />
            </div>
            <h4 className="mb-2 font-semibold">No Data Mining</h4>
            <p className="text-sm text-vault-text-secondary">
              We can&apos;t see your documents because they never reach our
              servers.
            </p>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vault-success-muted">
              <Lock className="h-8 w-8 text-vault-success" />
            </div>
            <h4 className="mb-2 font-semibold">End-to-End Encrypted</h4>
            <p className="text-sm text-vault-text-secondary">
              Even synced data is encrypted with keys only you control.
            </p>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vault-gold-muted">
              <Eye className="h-8 w-8 text-vault-gold" />
            </div>
            <h4 className="mb-2 font-semibold">Open & Auditable</h4>
            <p className="text-sm text-vault-text-secondary">
              Our privacy tests run on every deploy. Verify our claims yourself.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
