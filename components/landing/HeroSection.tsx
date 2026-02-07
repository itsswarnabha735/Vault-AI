'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-20">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      <motion.div
        className="mx-auto max-w-5xl text-center"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Privacy Badge */}
        <motion.div variants={fadeInUp} className="mb-6">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium"
          >
            <Shield className="mr-2 h-4 w-4 text-primary" />
            100% Private &bull; Your Data Stays on Your Device
          </Badge>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          variants={fadeInUp}
          className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Your Personal Finance AI
          <br />
          <span className="bg-gradient-to-r from-primary via-blue-500 to-purple-500 bg-clip-text text-transparent">
            That Never Sees Your Data
          </span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          variants={fadeInUp}
          className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Track expenses, search receipts instantly, and get AI-powered
          insights—all while your documents never leave your device. Privacy
          isn&apos;t a feature, it&apos;s our foundation.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeInUp}
          className="flex flex-col justify-center gap-4 sm:flex-row"
        >
          <Button size="lg" className="group px-8 py-6 text-lg" asChild>
            <Link href="/login">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="px-8 py-6 text-lg"
            asChild
          >
            <Link href="#how-it-works">See How It Works</Link>
          </Button>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          variants={fadeInUp}
          className="mt-8 flex flex-wrap justify-center gap-6"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>No credit card required</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-primary" />
            <span>Works offline</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>Export anytime</span>
          </div>
        </motion.div>

        {/* Hero Illustration */}
        <motion.div variants={fadeInUp} className="relative mt-16">
          <div className="relative mx-auto max-w-4xl">
            {/* Mock Dashboard Preview */}
            <div className="rounded-xl border bg-gradient-to-b from-muted/50 to-muted p-4 shadow-2xl sm:p-8">
              <div className="rounded-lg border bg-background p-4 sm:p-6">
                {/* Mock Header */}
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="h-4 w-32 rounded bg-muted" />
                      <div className="mt-1 h-3 w-20 rounded bg-muted/60" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-8 rounded bg-muted" />
                    <div className="h-8 w-8 rounded bg-muted" />
                  </div>
                </div>

                {/* Mock Stats */}
                <div className="mb-6 grid grid-cols-3 gap-4">
                  {[
                    {
                      label: 'This Month',
                      value: '$2,847',
                      color: 'text-green-500',
                    },
                    {
                      label: 'Budget Left',
                      value: '$653',
                      color: 'text-blue-500',
                    },
                    {
                      label: 'Transactions',
                      value: '47',
                      color: 'text-purple-500',
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-muted/30 p-4 text-center"
                    >
                      <div
                        className={`text-lg font-bold sm:text-2xl ${stat.color}`}
                      >
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mock Search */}
                <div className="mb-4 flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                  <div className="h-5 w-5 rounded bg-muted" />
                  <div className="h-4 w-48 rounded bg-muted" />
                </div>

                {/* Mock Transactions */}
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg bg-muted/20 p-3"
                    >
                      <div className="h-10 w-10 rounded-lg bg-muted" />
                      <div className="flex-1">
                        <div className="h-4 w-32 rounded bg-muted" />
                        <div className="mt-1 h-3 w-20 rounded bg-muted/60" />
                      </div>
                      <div className="h-4 w-16 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              className="absolute -left-4 -top-4 hidden items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 shadow-lg sm:flex"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Shield className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Encrypted Locally
              </span>
            </motion.div>

            <motion.div
              className="absolute -bottom-4 -right-4 hidden items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 shadow-lg sm:flex"
              animate={{ y: [0, 10, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 1.5,
              }}
            >
              <Zap className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                Instant Search
              </span>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
