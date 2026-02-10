'use client';

import Link from 'next/link';
import { Shield, Vault, Github, Twitter, Linkedin, Mail } from 'lucide-react';

const footerLinks = {
  product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'FAQ', href: '#faq' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Security', href: '/security' },
    { label: 'Cookie Policy', href: '/cookies' },
  ],
  resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'API Reference', href: '/api' },
    { label: 'Status', href: '/status' },
    { label: 'Changelog', href: '/changelog' },
  ],
};

const socialLinks = [
  { label: 'GitHub', href: 'https://github.com/vault-ai', icon: Github },
  { label: 'Twitter', href: 'https://twitter.com/vault_ai', icon: Twitter },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/company/vault-ai',
    icon: Linkedin,
  },
  { label: 'Email', href: 'mailto:hello@vault-ai.app', icon: Mail },
];

export function Footer() {
  return (
    <footer className="border-t border-[rgba(255,255,255,0.06)] bg-vault-bg-secondary">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        {/* Main Footer Content */}
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="mb-4 flex items-center gap-2">
              <div className="relative">
                <Shield className="h-8 w-8 text-vault-gold" />
                <Vault className="absolute bottom-0 right-0 h-4 w-4 translate-x-1 translate-y-1 text-vault-gold" />
              </div>
              <span className="text-xl font-bold">
                Vault<span className="text-vault-gold">AI</span>
              </span>
            </Link>
            <p className="mb-4 text-sm text-vault-text-secondary">
              Your personal finance AI that respects your privacy.
            </p>
            {/* Social Links */}
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-vault-text-secondary transition-colors hover:text-vault-text-primary"
                  aria-label={social.label}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="mb-4 font-semibold text-vault-text-primary">
              Product
            </h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-vault-text-secondary transition-colors hover:text-vault-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="mb-4 font-semibold text-vault-text-primary">
              Company
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-vault-text-secondary transition-colors hover:text-vault-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="mb-4 font-semibold text-vault-text-primary">
              Legal
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-vault-text-secondary transition-colors hover:text-vault-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="mb-4 font-semibold text-vault-text-primary">
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-vault-text-secondary transition-colors hover:text-vault-text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[rgba(255,255,255,0.06)] pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-vault-text-secondary">
              &copy; {new Date().getFullYear()} Vault-AI. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm text-vault-text-secondary">
              <Shield className="h-4 w-4 text-vault-success" />
              <span>Privacy-First Architecture</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
