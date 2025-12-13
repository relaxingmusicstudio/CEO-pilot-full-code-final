import { Link } from "react-router-dom";
import { Brain } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Footer = () => {
  const { isAdmin } = useAuth();

  return (
    <footer className="bg-primary py-12 pb-28">
      <div className="container">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary-foreground mb-4">
            Apex<span className="text-accent">Local</span>360
          </div>
          <p className="text-primary-foreground/70 max-w-md mx-auto mb-6">
            Done-for-you AI voice agents that answer, book, and upsell 24/7. Built in 48 hours. No contracts.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-primary-foreground/60 text-sm">
            <a href="#" className="hover:text-accent transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-accent transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-accent transition-colors">Contact Us</a>
            {isAdmin && (
              <Link 
                to="/admin/analytics" 
                className="hover:text-accent transition-colors flex items-center gap-1"
              >
                <Brain className="w-3 h-3" />
                CEO Agent
              </Link>
            )}
          </div>
          <div className="mt-8 text-primary-foreground/40 text-sm">
            © 2024 ApexLocal360. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
