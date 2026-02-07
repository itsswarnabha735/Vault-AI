'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Zap, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const plans = [
  {
    name: 'Free',
    description: 'Perfect for getting started',
    price: '$0',
    period: 'forever',
    icon: Shield,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    features: [
      'Up to 100 documents',
      'Local storage only',
      'Basic semantic search',
      'Manual categorization',
      'Export to CSV',
      'Works offline',
    ],
    cta: 'Get Started',
    ctaVariant: 'outline' as const,
    popular: false,
  },
  {
    name: 'Pro',
    description: 'For power users',
    price: '$9',
    period: 'per month',
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary',
    features: [
      'Unlimited documents',
      'Cloud sync across devices',
      'Advanced AI search',
      'Auto-categorization',
      'AI chat assistant',
      'Budget tracking',
      'Monthly spending reports',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'default' as const,
    popular: true,
  },
  {
    name: 'Business',
    description: 'For teams and professionals',
    price: '$29',
    period: 'per month',
    icon: Sparkles,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
    features: [
      'Everything in Pro',
      'Multiple user accounts',
      'Shared categories & budgets',
      'Advanced analytics',
      'API access',
      'Custom integrations',
      'Dedicated support',
      'SOC 2 compliance',
    ],
    cta: 'Contact Sales',
    ctaVariant: 'outline' as const,
    popular: false,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

export function PricingSection() {
  return (
    <section id="pricing" className="px-4 py-20">
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
            Simple, Transparent
            <br />
            <span className="text-primary">Pricing</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Start free, upgrade when you need more. No hidden fees, cancel
            anytime.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <motion.div
          className="grid gap-8 md:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={itemVariants}
              className={`relative rounded-2xl border bg-card p-6 sm:p-8 ${
                plan.popular
                  ? 'scale-105 border-primary shadow-lg shadow-primary/10'
                  : 'hover:border-primary/50'
              } transition-all`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}

              {/* Plan Header */}
              <div className="mb-6 text-center">
                <div
                  className={`inline-flex h-12 w-12 rounded-full ${plan.bgColor}/10 mb-4 items-center justify-center`}
                >
                  <plan.icon className={`h-6 w-6 ${plan.color}`} />
                </div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              {/* Price */}
              <div className="mb-6 text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/{plan.period}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="mb-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      className={`h-5 w-5 ${plan.color} mt-0.5 shrink-0`}
                    />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                className="w-full"
                variant={plan.ctaVariant}
                size="lg"
                asChild
              >
                <Link href="/login">{plan.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </motion.div>

        {/* Money Back Guarantee */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-2 text-green-600 dark:text-green-400">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">
              30-day money-back guarantee
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Try Pro or Business risk-free. Not satisfied? Get a full refund, no
            questions asked.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
