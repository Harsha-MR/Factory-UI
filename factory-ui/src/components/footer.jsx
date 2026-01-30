import { Mail, Phone, MapPin, Linkedin, Twitter, Github } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    Product: [
      { label: "Features", href: "#" },
      { label: "Pricing", href: "#" },
      { label: "Documentation", href: "#" },
      { label: "API", href: "#" },
    ],
    Company: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
    Legal: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "License", href: "#" },
      { label: "Security", href: "#" },
    ],
  };

  const socialLinks = [
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Twitter, href: "#", label: "Twitter" },
    { icon: Github, href: "#", label: "GitHub" },
  ];

  return (
    <footer className="bg-gradient-to-b from-slate-900 to-slate-950 text-slate-300 border-t border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 py-12">
          <div className="md:col-span-1">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">
                  Factory UI
                </h3>
                <p className="text-sm text-slate-400">
                  Advanced manufacturing and production management platform
                </p>
              </div>
              <div className="flex gap-3">
                {socialLinks.map((social) => {
                  const Icon = social.icon;
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      aria-label={social.label}
                      className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-200"
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <Mail className="w-5 h-5 text-blue-500 mt-0.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Email</p>
                <a
                  href="mailto:support@factoryui.com"
                  className="text-sm text-slate-400 hover:text-white"
                >
                  support@factoryui.com
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <Phone className="w-5 h-5 text-blue-500 mt-0.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Phone</p>
                <a
                  href="tel:+1234567890"
                  className="text-sm text-slate-400 hover:text-white"
                >
                  +1 (234) 567-890
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <MapPin className="w-5 h-5 text-blue-500 mt-0.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">Location</p>
                <p className="text-sm text-slate-400">
                  123 Industrial Way, Tech City, TC 12345
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-slate-400">
            © {currentYear} Factory UI. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Status
            </a>
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Feedback
            </a>
            <a
              href="#"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
