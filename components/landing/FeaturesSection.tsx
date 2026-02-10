'use client';

import { motion } from 'framer-motion';
import {
  Search,
  Shield,
  Brain,
  RefreshCw,
  Copy,
  WifiOff,
  FileText,
  Lock,
  Zap,
  MessageSquare,
  PieChart,
  Download,
} from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Zero-Latency Search',
    description:
      'Find any receipt or document in milliseconds. AI-powered semantic search runs entirely on your device for instant results.',
    color: 'text-vault-info',
    bgColor: 'bg-vault-info-muted',
  },
  {
    icon: Shield,
    title: 'Privacy by Design',
    description:
      'Your documents never leave your device. All processing happens locally—no cloud uploads, no data mining, no compromises.',
    color: 'text-vault-success',
    bgColor: 'bg-vault-success-muted',
  },
  {
    icon: Brain,
    title: 'AI-Powered Analysis',
    description:
      'Chat with your finances naturally. Get spending insights, budget recommendations, and answers about your transactions.',
    color: 'text-vault-gold-secondary',
    bgColor: 'bg-vault-gold-muted',
  },
  {
    icon: RefreshCw,
    title: 'Multi-Device Sync',
    description:
      'Sync your structured data (amounts, categories) across devices while keeping sensitive documents local.',
    color: 'text-vault-warning',
    bgColor: 'bg-vault-warning-muted',
  },
  {
    icon: Copy,
    title: 'Duplicate Detection',
    description:
      'Automatically detect and flag potential duplicate receipts to keep your records clean and accurate.',
    color: 'text-vault-gold-secondary',
    bgColor: 'bg-vault-gold-muted',
  },
  {
    icon: WifiOff,
    title: 'Works Offline',
    description:
      'Full functionality without internet. Import documents, search, and analyze your finances anywhere, anytime.',
    color: 'text-vault-info',
    bgColor: 'bg-vault-info-muted',
  },
  {
    icon: FileText,
    title: 'Smart Extraction',
    description:
      'OCR automatically extracts dates, amounts, and vendors from receipts. Just snap a photo or upload a PDF.',
    color: 'text-vault-warning',
    bgColor: 'bg-vault-warning-muted',
  },
  {
    icon: MessageSquare,
    title: 'Natural Language Chat',
    description:
      'Ask questions like "How much did I spend on groceries last month?" and get accurate, cited answers.',
    color: 'text-vault-gold-secondary',
    bgColor: 'bg-vault-gold-muted',
  },
  {
    icon: PieChart,
    title: 'Visual Analytics',
    description:
      'Beautiful charts and insights to understand your spending patterns at a glance.',
    color: 'text-vault-gold-secondary',
    bgColor: 'bg-vault-gold-muted',
  },
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    description:
      'Even the minimal data that syncs is encrypted. Your financial data stays yours.',
    color: 'text-vault-success',
    bgColor: 'bg-vault-success-muted',
  },
  {
    icon: Zap,
    title: 'Instant Import',
    description:
      'Drag and drop multiple files at once. Batch processing handles dozens of documents effortlessly.',
    color: 'text-vault-gold',
    bgColor: 'bg-vault-gold-muted',
  },
  {
    icon: Download,
    title: 'Export Anywhere',
    description:
      'Export your data to CSV, JSON, or PDF anytime. You own your data, always.',
    color: 'text-vault-info',
    bgColor: 'bg-vault-info-muted',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
    },
  },
};

export function FeaturesSection() {
  return (
    <section id="features" className="px-4 py-20">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 font-display text-3xl font-bold sm:text-4xl">
            Everything You Need to
            <br />
            <span className="text-vault-gold">Master Your Finances</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-vault-text-secondary">
            Powerful features designed with your privacy in mind. No
            compromises.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-6 transition-all duration-300 hover:border-vault-gold/30 hover:shadow-lg"
            >
              {/* Icon */}
              <div
                className={`h-12 w-12 rounded-lg ${feature.bgColor} mb-4 flex items-center justify-center transition-transform group-hover:scale-110`}
              >
                <feature.icon className={`h-6 w-6 ${feature.color}`} />
              </div>

              {/* Content */}
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-vault-text-secondary">
                {feature.description}
              </p>

              {/* Hover Gradient */}
              <div className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-vault-gold-glow to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
