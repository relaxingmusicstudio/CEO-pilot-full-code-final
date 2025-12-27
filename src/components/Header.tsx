import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useVisitor } from "@/contexts/useVisitor";

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const { trackCtaClick } = useVisitor();

  const scrollToSection = (id: string) => {
    trackCtaClick(`nav-${id}`);
    if (isHomePage) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `/#${id}`;
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-md border-b border-primary-foreground/10">
      <div className="container flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Phone className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-xl font-bold text-primary-foreground">
            Apex<span className="text-accent">Local</span>360
            <span className="mt-0.5 block text-xs font-medium text-primary-foreground/70">Search Pilot</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => scrollToSection("calculator")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            Calculator
          </button>
          <button 
            onClick={() => scrollToSection("demo")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            Demo
          </button>
          <button 
            onClick={() => scrollToSection("pricing")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            Pricing
          </button>
          <button 
            onClick={() => scrollToSection("faq")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            FAQ
          </button>
          <Link 
            to="/blog"
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
            onClick={() => trackCtaClick("nav-blog")}
          >
            Blog
          </Link>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            onClick={() => trackCtaClick("nav-signin")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            Sign in
          </Link>
          <Button 
            variant="accent" 
            size="default"
            onClick={() => scrollToSection("pricing")}
          >
            Get Started
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="md:hidden w-10 h-10 flex items-center justify-center text-primary-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-primary border-t border-primary-foreground/10 py-4">
          <div className="container flex flex-col gap-4">
            <button 
              onClick={() => scrollToSection("calculator")}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Calculator
            </button>
            <button 
              onClick={() => scrollToSection("demo")}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Demo
            </button>
            <button 
              onClick={() => scrollToSection("pricing")}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Pricing
            </button>
            <button 
              onClick={() => scrollToSection("faq")}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              FAQ
            </button>
            <Link 
              to="/blog"
              onClick={() => {
                trackCtaClick("nav-blog-mobile");
                setIsMobileMenuOpen(false);
              }}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Blog
            </Link>
            <Link
              to="/login"
              onClick={() => {
                trackCtaClick("nav-signin-mobile");
                setIsMobileMenuOpen(false);
              }}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Sign in
            </Link>
            <Button 
              variant="accent" 
              size="lg"
              onClick={() => scrollToSection("pricing")}
              className="w-full mt-2"
            >
              Get Started
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
