import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

/**
 * Boilerplate Privacy Policy page.
 * Replace the content in the `policyContent` variable below with your actual privacy policy markdown/text.
 */
export function PrivacyPolicyPage() {
  const navigate = useNavigate();
  // ============================================================
  // REPLACE THIS CONTENT with your actual Privacy Policy text.
  // You can paste in plain text or HTML — it will render as-is.
  // ============================================================
  const policyContent = `
    <h2>1. Introduction</h2>
    <p>Welcome to Persona Forge ("we," "our," or "us"), a product by Pehloo. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website at <a href="https://personaforge.pehloo.xyz">personaforge.pehloo.xyz</a> and use our services.</p>

    <h2>2. Information We Collect</h2>
    <h3>Information You Provide</h3>
    <ul>
      <li><strong>Account Information:</strong> When you create an account, we collect your name, email address, and authentication credentials (via Google OAuth).</li>
      <li><strong>Payment Information:</strong> When you purchase a subscription, payment is processed through Razorpay. We do not store your full payment card details.</li>
      <li><strong>Product Descriptions:</strong> Text you submit to generate user personas.</li>
    </ul>

    <h3>Information Collected Automatically</h3>
    <ul>
      <li><strong>Usage Data:</strong> Pages visited, features used, timestamps, and interaction patterns.</li>
      <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers.</li>
      <li><strong>Cookies and Analytics:</strong> We use Google Analytics and Google Tag Manager to understand site usage.</li>
    </ul>

    <h2>3. How We Use Your Information</h2>
    <ul>
      <li>To provide and maintain our AI persona generation service</li>
      <li>To process transactions and send related information</li>
      <li>To send administrative information, updates, and security alerts</li>
      <li>To improve our services and develop new features</li>
      <li>To comply with legal obligations</li>
    </ul>

    <h2>4. Data Sharing and Disclosure</h2>
    <p>We do not sell your personal information. We may share information with:</p>
    <ul>
      <li><strong>Service Providers:</strong> Google (authentication, analytics), Razorpay (payments), and cloud hosting providers.</li>
      <li><strong>AI Model Providers:</strong> Product descriptions are sent to Google Gemini API for persona generation. Refer to Google's AI privacy terms for details.</li>
      <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
    </ul>

    <h2>5. Data Security</h2>
    <p>We implement appropriate technical and organizational measures to protect your personal information. However, no method of transmission over the Internet is 100% secure.</p>

    <h2>6. Your Rights</h2>
    <p>You may request access to, correction of, or deletion of your personal data by contacting us at <a href="mailto:ribhu.lahiri@gmail.com">ribhu.lahiri@gmail.com</a>.</p>

    <h2>7. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>

    <h2>8. Contact Us</h2>
    <p>If you have questions about this Privacy Policy, contact us at:<br/>
    <a href="mailto:ribhu.lahiri@gmail.com">ribhu.lahiri@gmail.com</a></p>

    <p><em>Last updated: March 2026</em></p>
  `;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Privacy Policy — Persona Forge by Pehloo</title>
        <meta name="description" content="Learn how Persona Forge collects, uses, and protects your personal information." />
        <link rel="canonical" href="https://personaforge.pehloo.xyz/privacy" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div
          className="prose max-w-none
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-4
            [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-3
            [&_p]:text-foreground [&_p]:leading-relaxed [&_p]:mb-4
            [&_ul]:text-foreground [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc
            [&_li]:mb-2
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4
            [&_strong]:text-foreground"
          dangerouslySetInnerHTML={{ __html: policyContent }}
        />
      </div>
    </div>
  );
}
