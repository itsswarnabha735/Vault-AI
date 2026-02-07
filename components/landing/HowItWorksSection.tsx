'use client';

import { motion } from 'framer-motion';
import {
  Upload,
  Cpu,
  Search,
  Settings,
  ArrowRight,
  FileText,
  Sparkles,
  MessageSquare,
  Shield,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Import Documents',
    description:
      'Drag and drop receipts, invoices, and financial documents. We support PDFs, images, and more.',
    icon: Upload,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    illustration: (
      <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-10 w-10" />
            <span className="text-sm">Drop files here</span>
          </div>
        </motion.div>
        <motion.div
          className="absolute"
          animate={{ y: ['-100%', '0%'] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
        >
          <div className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-lg border bg-card shadow-lg">
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-[10px] text-muted-foreground">
              receipt.pdf
            </span>
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    number: '02',
    title: 'AI Extracts Data',
    description:
      'Our on-device AI reads your documents, extracting dates, amounts, and vendors automatically.',
    icon: Cpu,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
    illustration: (
      <div className="relative h-40 w-full overflow-hidden rounded-lg border bg-muted/50">
        <div className="absolute inset-0 p-4">
          <div className="flex gap-3">
            <div className="flex h-20 w-16 items-center justify-center rounded-lg border bg-card">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-2">
              <motion.div
                className="h-3 rounded bg-gradient-to-r from-purple-500/50 to-purple-500/20"
                initial={{ width: 0 }}
                animate={{ width: '80%' }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="h-3 rounded bg-gradient-to-r from-purple-500/50 to-purple-500/20"
                initial={{ width: 0 }}
                animate={{ width: '60%' }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="h-3 rounded bg-gradient-to-r from-purple-500/50 to-purple-500/20"
                initial={{ width: 0 }}
                animate={{ width: '70%' }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <motion.div
              className="flex items-center gap-2 text-sm text-purple-500"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Sparkles className="h-4 w-4" />
              <span>Extracting: Date, Amount, Vendor...</span>
            </motion.div>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: '03',
    title: 'Search & Analyze',
    description:
      'Find any document instantly with semantic search. Ask questions and get AI-powered insights.',
    icon: Search,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    illustration: (
      <div className="relative h-40 w-full overflow-hidden rounded-lg border bg-muted/50 p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <motion.span
            className="text-sm"
            initial={{ width: 0 }}
            animate={{ width: 'auto' }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
          >
            grocery receipts last month
          </motion.span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="flex items-center gap-2 rounded-lg border bg-card p-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.3 + 1, duration: 0.3 }}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-green-500/20">
                <FileText className="h-3 w-3 text-green-500" />
              </div>
              <div className="flex-1">
                <div className="h-2 w-24 rounded bg-muted" />
              </div>
              <div className="h-2 w-12 rounded bg-green-500/30" />
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    number: '04',
    title: 'Stay in Control',
    description:
      'Manage privacy settings, export your data anytime, and sync across devices—on your terms.',
    icon: Settings,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
    illustration: (
      <div className="relative h-40 w-full overflow-hidden rounded-lg border bg-muted/50 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm">Local Storage</span>
            </div>
            <div className="relative h-5 w-10 rounded-full bg-green-500">
              <motion.div
                className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow"
                animate={{ x: [0, 0] }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <span className="text-sm">Cloud Sync</span>
            </div>
            <motion.div
              className="relative h-5 w-10 rounded-full bg-blue-500"
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow"
                animate={{ x: [0, 0] }}
              />
            </motion.div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-500" />
              <span className="text-sm">AI Insights</span>
            </div>
            <div className="relative h-5 w-10 rounded-full bg-orange-500">
              <motion.div
                className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow"
                animate={{ x: [0, 0] }}
              />
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-muted-foreground">
          Your data, your rules
        </div>
      </div>
    ),
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
            Simple to Use,
            <br />
            <span className="text-primary">Powerful Under the Hood</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Get started in minutes. No complex setup, no learning curve.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting Line */}
          <div className="absolute bottom-0 left-8 top-0 hidden w-0.5 bg-gradient-to-b from-blue-500 via-green-500 via-purple-500 to-orange-500 md:block lg:left-1/2" />

          <div className="space-y-12 lg:space-y-24">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                className={`relative grid items-center gap-8 lg:grid-cols-2 ${
                  index % 2 === 1 ? 'lg:direction-rtl' : ''
                }`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6 }}
              >
                {/* Content */}
                <div
                  className={`${index % 2 === 1 ? 'lg:order-2 lg:text-right' : ''}`}
                >
                  {/* Step Number Badge */}
                  <div
                    className={`inline-flex items-center gap-2 ${step.bgColor}/10 text-${step.color.replace('text-', '')} mb-4 rounded-full px-3 py-1`}
                  >
                    <span className={`text-sm font-bold ${step.color}`}>
                      Step {step.number}
                    </span>
                  </div>

                  <h3 className="mb-4 text-2xl font-bold sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mb-6 text-lg text-muted-foreground">
                    {step.description}
                  </p>

                  {/* Feature highlights */}
                  <div
                    className={`flex flex-wrap gap-3 ${index % 2 === 1 ? 'lg:justify-end' : ''}`}
                  >
                    <div
                      className={`inline-flex items-center gap-2 ${step.color} text-sm`}
                    >
                      <step.icon className="h-4 w-4" />
                      <span className="font-medium">
                        {index === 0 && 'Drag & Drop'}
                        {index === 1 && 'On-Device AI'}
                        {index === 2 && 'Semantic Search'}
                        {index === 3 && 'Full Control'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Illustration */}
                <div
                  className={`relative ${index % 2 === 1 ? 'lg:order-1' : ''}`}
                >
                  {/* Step indicator for mobile */}
                  <div
                    className={`absolute -left-4 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full ${step.bgColor} z-10 flex items-center justify-center text-sm font-bold text-white md:hidden`}
                  >
                    {index + 1}
                  </div>

                  {/* Step indicator for desktop */}
                  <div
                    className={`absolute hidden md:flex -${index % 2 === 1 ? 'right' : 'left'}-4 lg:${index % 2 === 1 ? '-right-4' : 'left-1/2'} top-1/2 h-8 w-8 -translate-y-1/2 rounded-full lg:-translate-x-1/2 ${step.bgColor} z-10 items-center justify-center text-sm font-bold text-white`}
                  >
                    {index + 1}
                  </div>

                  <div className="rounded-xl border bg-card p-6 shadow-lg transition-shadow hover:shadow-xl">
                    {step.illustration}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 font-medium text-primary">
            <span>Ready to get started?</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
