import { useParams, Link, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getPostBySlug, getRecentPosts } from "@/data/blogPosts";
import { Calendar, Clock, ArrowLeft, User, Tag, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVisitor } from "@/contexts/useVisitor";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;
  const recentPosts = getRecentPosts(3).filter((p) => p.slug !== slug);
  const { trackCtaClick, trackSectionView } = useVisitor();

  // Track blog post view
  useEffect(() => {
    if (post) {
      trackSectionView(`blog-post-${post.slug}`);
    }
  }, [post, trackSectionView]);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  // Simple markdown-like rendering (basic implementation)
  const renderContent = (content: string) => {
    return content.split("\n").map((line, index) => {
      // Headers
      if (line.startsWith("## ")) {
        return (
          <h2
            key={index}
            className="text-2xl font-bold text-foreground mt-8 mb-4"
          >
            {line.replace("## ", "")}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3
            key={index}
            className="text-xl font-semibold text-foreground mt-6 mb-3"
          >
            {line.replace("### ", "")}
          </h3>
        );
      }

      // Bold text
      if (line.includes("**")) {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={index} className="text-muted-foreground mb-4 leading-relaxed">
            {parts.map((part, i) =>
              i % 2 === 1 ? (
                <strong key={i} className="text-foreground font-semibold">
                  {part}
                </strong>
              ) : (
                part
              )
            )}
          </p>
        );
      }

      // List items
      if (line.startsWith("- ")) {
        return (
          <li
            key={index}
            className="text-muted-foreground ml-6 mb-2 list-disc"
          >
            {line.replace("- ", "")}
          </li>
        );
      }

      // Numbered list items
      if (/^\d+\.\s/.test(line)) {
        return (
          <li
            key={index}
            className="text-muted-foreground ml-6 mb-2 list-decimal"
          >
            {line.replace(/^\d+\.\s/, "")}
          </li>
        );
      }

      // Table rows (basic)
      if (line.startsWith("|")) {
        const cells = line.split("|").filter((c) => c.trim());
        if (line.includes("---")) return null;
        return (
          <tr key={index} className="border-b border-border">
            {cells.map((cell, i) => (
              <td key={i} className="px-4 py-2 text-sm text-muted-foreground">
                {cell.trim()}
              </td>
            ))}
          </tr>
        );
      }

      // Empty lines
      if (line.trim() === "") {
        return null;
      }

      // Regular paragraphs
      return (
        <p key={index} className="text-muted-foreground mb-4 leading-relaxed">
          {line}
        </p>
      );
    });
  };

  const shareUrl = `https://apexlocal360.com/blog/${post.slug}`;

  return (
    <>
      <Helmet>
        <title>{post.title} | ApexLocal360 Blog</title>
        <meta name="description" content={post.metaDescription} />
        <link rel="canonical" href={shareUrl} />

        {/* Open Graph */}
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={shareUrl} />
        <meta
          property="article:published_time"
          content={post.publishedAt}
        />
        <meta property="article:author" content={post.author} />
        <meta property="article:section" content={post.category} />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}

        {/* Twitter */}
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.metaDescription} />
      </Helmet>

      <main className="min-h-screen bg-background">
        <Header />

        {/* Article Header */}
        <section className="pt-24 pb-12 hero-gradient text-primary-foreground">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              {/* Back Link */}
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground mb-6 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Blog
              </Link>

              {/* Category */}
              <Badge className="bg-accent text-accent-foreground mb-4">
                {post.category}
              </Badge>

              {/* Title */}
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6"
                itemProp="headline"
              >
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-primary-foreground/80">
                <span className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span itemProp="author">{post.author}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <time itemProp="datePublished" dateTime={post.publishedAt}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {post.readTime} min read
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Article Content */}
        <article
          className="py-12"
          itemScope
          itemType="https://schema.org/BlogPosting"
        >
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              {/* Content */}
              <div
                className="prose prose-lg max-w-none"
                itemProp="articleBody"
              >
                {renderContent(post.content)}
              </div>

              {/* Tags */}
              <div className="mt-12 pt-8 border-t border-border">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Share */}
              <div className="mt-8 p-6 bg-secondary/30 rounded-lg">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Found this helpful?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Share it with other plumbing business owners.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      trackCtaClick(`blog-share-${post.slug}`);
                      navigator.clipboard.writeText(shareUrl);
                    }}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Copy Link
                  </Button>
                </div>
              </div>

              {/* CTA */}
              <div className="mt-12 p-8 bg-primary text-primary-foreground rounded-lg text-center">
                <h3 className="text-2xl font-bold mb-3">
                  Ready to Stop Missing Calls?
                </h3>
                <p className="opacity-90 mb-6">
                  See how an AI voice agent can book more appointments for your
                  plumbing business.
                </p>
                <Link
                  to="/#contact"
                  className="inline-block px-6 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:bg-accent/90 transition-colors"
                  onClick={() => trackCtaClick("blog-post-contact-cta")}
                >
                  Talk to Our Team
                </Link>
              </div>
            </div>
          </div>
        </article>

        {/* Related Posts */}
        {recentPosts.length > 0 && (
          <section className="py-12 bg-secondary/30">
            <div className="container mx-auto px-4">
              <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
                More Articles You Might Like
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {recentPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.slug}
                    to={`/blog/${relatedPost.slug}`}
                    className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow group"
                    onClick={() => trackCtaClick(`blog-related-${relatedPost.slug}`)}
                  >
                    <Badge variant="outline" className="mb-3">
                      {relatedPost.category}
                    </Badge>
                    <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                      {relatedPost.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {relatedPost.readTime} min read
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <Footer />
      </main>
    </>
  );
};

export default BlogPost;
