'use client';

import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Freelance Designer',
    avatar: 'SC',
    content:
      "Finally, a finance app that doesn't make me choose between convenience and privacy. The search is incredibly fast, and I love knowing my receipts never leave my laptop.",
    rating: 5,
    color: 'bg-vault-gold',
  },
  {
    name: 'Marcus Johnson',
    role: 'Small Business Owner',
    avatar: 'MJ',
    content:
      "I was skeptical about 'local-first' but the experience is seamless. Syncing across my devices works great, and the AI categorization saves me hours every month.",
    rating: 5,
    color: 'bg-vault-gold-secondary',
  },
  {
    name: 'Elena Rodriguez',
    role: 'Privacy Advocate',
    avatar: 'ER',
    content:
      'As someone who audits privacy claims for a living, I was impressed. Their architecture genuinely keeps sensitive data local. This is how all finance apps should work.',
    rating: 5,
    color: 'bg-vault-success',
  },
  {
    name: 'David Park',
    role: 'Software Engineer',
    avatar: 'DP',
    content:
      "The semantic search is mind-blowing. I can describe what I'm looking for in natural language and it just finds it. Works offline too, which is perfect for travel.",
    rating: 5,
    color: 'bg-vault-warning',
  },
  {
    name: 'Lisa Thompson',
    role: 'Accountant',
    avatar: 'LT',
    content:
      'My clients love that their financial documents stay on their own devices. The export features make tax season so much easier. Highly recommend for any finance professional.',
    rating: 5,
    color: 'bg-vault-info',
  },
  {
    name: 'Alex Kim',
    role: 'Digital Nomad',
    avatar: 'AK',
    content:
      "Works perfectly offline which is essential when I'm traveling. The AI chat feature helps me track expenses across multiple currencies and categories effortlessly.",
    rating: 5,
    color: 'bg-vault-gold-muted',
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

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="bg-vault-bg-secondary py-20">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 font-display text-3xl font-bold sm:text-4xl">
            Loved by Privacy-Conscious
            <br />
            <span className="text-vault-gold">Users Everywhere</span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-vault-text-secondary">
            Join thousands of users who trust Vault-AI with their financial
            documents.
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <motion.div
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
        >
          {testimonials.map((testimonial) => (
            <motion.div
              key={testimonial.name}
              variants={itemVariants}
              className="relative rounded-xl border border-[rgba(255,255,255,0.10)] bg-vault-bg-elevated p-6 transition-shadow hover:shadow-lg"
            >
              {/* Quote Icon */}
              <Quote className="absolute right-4 top-4 h-8 w-8 text-vault-text-secondary/20" />

              {/* Rating */}
              <div className="mb-4 flex gap-1">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-vault-gold text-vault-gold"
                  />
                ))}
              </div>

              {/* Content */}
              <p className="mb-6 leading-relaxed text-vault-text-secondary">
                &quot;{testimonial.content}&quot;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-full ${testimonial.color} flex items-center justify-center text-sm font-medium text-white`}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {testimonial.name}
                  </div>
                  <div className="text-sm text-vault-text-secondary">
                    {testimonial.role}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <p className="mb-6 text-sm text-vault-text-secondary">
            Trusted by users in 50+ countries
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
            {/* Placeholder for trust badges/logos */}
            <div className="text-2xl font-bold text-vault-text-secondary">
              10,000+
            </div>
            <div className="text-sm text-vault-text-secondary">Active Users</div>
            <div className="h-8 w-px bg-[rgba(255,255,255,0.06)]" />
            <div className="text-2xl font-bold text-vault-text-secondary">1M+</div>
            <div className="text-sm text-vault-text-secondary">
              Documents Processed
            </div>
            <div className="h-8 w-px bg-[rgba(255,255,255,0.06)]" />
            <div className="text-2xl font-bold text-vault-text-secondary">4.9</div>
            <div className="text-sm text-vault-text-secondary">Average Rating</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
