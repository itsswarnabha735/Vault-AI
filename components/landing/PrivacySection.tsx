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
    <section id="privacy" className="bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-2 text-green-600 dark:text-green-400">
            <Shield className="h-5 w-5" />
            <span className="font-medium">Local-First Architecture</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Privacy That&apos;s Built In,
            <br />
            <span className="text-primary">Not Bolted On</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            We designed Vault-AI from the ground up with a simple principle:
            your sensitive data never leaves your device. Ever.
          </p>
        </motion.div>

        {/* Privacy Comparison */}
        <div className="mb-16 grid gap-8 md:grid-cols-2">
          {/* What Stays Local */}
          <motion.div
            className="rounded-xl border border-green-500/30 bg-card p-6 sm:p-8"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <Shield className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Stays on Your Device</h3>
                <p className="text-sm text-muted-foreground">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 transition-transform group-hover:scale-110">
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="text-sm sm:text-base">{item.text}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                <Lock className="h-4 w-4" />
                Protected by browser&apos;s Origin Private File System
              </div>
            </div>
          </motion.div>

          {/* What Syncs */}
          <motion.div
            className="rounded-xl border border-blue-500/30 bg-card p-6 sm:p-8"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
                <Cloud className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">
                  Syncs to Cloud (Optional)
                </h3>
                <p className="text-sm text-muted-foreground">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 transition-transform group-hover:scale-110">
                    <Info className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="text-sm sm:text-base">{item.text}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
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
          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <EyeOff className="h-8 w-8 text-red-500" />
            </div>
            <h4 className="mb-2 font-semibold">No Data Mining</h4>
            <p className="text-sm text-muted-foreground">
              We can&apos;t see your documents because they never reach our
              servers.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Lock className="h-8 w-8 text-green-500" />
            </div>
            <h4 className="mb-2 font-semibold">End-to-End Encrypted</h4>
            <p className="text-sm text-muted-foreground">
              Even synced data is encrypted with keys only you control.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10">
              <Eye className="h-8 w-8 text-purple-500" />
            </div>
            <h4 className="mb-2 font-semibold">Open & Auditable</h4>
            <p className="text-sm text-muted-foreground">
              Our privacy tests run on every deploy. Verify our claims yourself.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
