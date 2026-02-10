'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTASection() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <motion.div
          className="relative overflow-hidden rounded-3xl border border-[rgba(200,164,78,0.3)] bg-gradient-to-br from-vault-bg-elevated via-vault-bg-surface to-vault-bg-tertiary p-8 text-center text-vault-text-primary sm:p-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/4 top-0 h-64 w-64 rounded-full bg-vault-gold-muted/20 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-vault-gold-muted/10 blur-3xl" />
          </div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-vault-gold-muted px-4 py-2">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">
                100% Private • Free to Start
              </span>
            </div>
          </motion.div>

          <motion.h2
            className="mb-4 font-display text-3xl font-bold sm:text-4xl lg:text-5xl"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            Ready to Take Control of
            <br />
            Your Finances?
          </motion.h2>

          <motion.p
            className="mx-auto mb-8 max-w-2xl text-lg text-vault-text-secondary"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            Join thousands of users who manage their finances privately. Set up
            in 2 minutes, no credit card required.
          </motion.p>

          <motion.div
            className="flex flex-col justify-center gap-4 sm:flex-row"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <Button
              size="lg"
              variant="secondary"
              className="gradient-vault group px-8 py-6 text-lg text-vault-bg-primary hover:opacity-90"
              asChild
            >
              <Link href="/login">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface px-8 py-6 text-lg text-vault-text-primary hover:bg-vault-bg-hover"
              asChild
            >
              <Link href="#how-it-works">Watch Demo</Link>
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-vault-text-tertiary"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>Setup in 2 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Cancel anytime</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
