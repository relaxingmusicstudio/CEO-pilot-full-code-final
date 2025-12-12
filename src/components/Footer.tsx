const Footer = () => {
  return (
    <footer className="bg-primary py-12 pb-28">
      <div className="container">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary-foreground mb-4">
            [MY_COMPANY_NAME]
          </div>
          <p className="text-primary-foreground/70 max-w-md mx-auto mb-6">
            Done-for-you AI voice agents for HVAC companies that answer, book, and upsell 24/7. Built in 48 hours. No contracts.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-primary-foreground/60 text-sm">
            <a href="#" className="hover:text-accent transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-accent transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-accent transition-colors">Contact Us</a>
          </div>
          <div className="mt-8 text-primary-foreground/40 text-sm">
            © 2024 [MY_COMPANY_NAME]. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
