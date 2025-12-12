import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import { useState } from "react";

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-md border-b border-primary-foreground/10">
      <div className="container flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <Phone className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-xl font-bold text-primary-foreground">
            Apex<span className="text-accent">Local</span>360
          </span>
        </div>

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
            onClick={() => scrollToSection("pricing")}
            className="text-primary-foreground/80 hover:text-accent transition-colors font-medium"
          >
            Sign Up
          </button>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block">
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
              onClick={() => scrollToSection("pricing")}
              className="text-primary-foreground/80 hover:text-accent transition-colors font-medium text-left py-2"
            >
              Sign Up
            </button>
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
