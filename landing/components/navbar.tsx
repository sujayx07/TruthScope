"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Shield, Menu, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState("hero")

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)

      const sections = ["hero", "features", "workflow", "testimonials", "pricing"]
      const currentSection =
        sections.find((section) => {
          const element = document.getElementById(section)
          if (!element) return false

          const rect = element.getBoundingClientRect()
          return rect.top <= 100 && rect.bottom >= 100
        }) || "hero"

      setActiveSection(currentSection)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault()
    const section = document.getElementById(sectionId)
    if (section) {
      window.scrollTo({
        top: section.offsetTop - 50, // Adjust offset for navbar height
        behavior: "smooth",
      })
    }
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-500",
        scrolled ? "bg-background/80 backdrop-blur-xl shadow-sm border-b border-slate-200/20" : "bg-transparent",
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Shield className="h-8 w-8 text-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Shield className="h-8 w-8 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent animate-pulse-slow" />
            </div>
          </div>
          <span className="p-0.5 text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            TruthScope
          </span>
        </div>

        <nav className="hidden md:flex gap-8">
          {[
            { href: "hero", label: "Home" },
            { href: "features", label: "Features" },
            { href: "workflow", label: "How It Works" },
            { href: "testimonials", label: "Testimonials" },
            { href: "pricing", label: "Pricing" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={`#${href}`}
              onClick={(e) => handleSmoothScroll(e, href)}
              className={cn(
                "text-sm font-medium transition-all duration-300 relative group cursor-pointer",
                activeSection === href ? "text-primary" : "text-foreground/80 hover:text-primary",
              )}
            >
              {label}
              <span
                className={cn(
                  "absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-primary to-purple-600 transition-all duration-300",
                  activeSection === href ? "w-full" : "w-0 group-hover:w-full",
                )}
              />
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link href="#" className="text-sm font-medium transition-colors hover:text-primary">
            Log in
          </Link>
          <Button className="relative overflow-hidden group bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 transition-all duration-300">
            <span className="relative z-10 flex items-center">
              Add to Chrome
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {isMenuOpen && (
        <div className="container md:hidden py-4 border-t animate-in slide-in-from-top duration-300 bg-background/80 backdrop-blur-xl">
          <nav className="flex flex-col gap-4">
            {[
              { href: "hero", label: "Home" },
              { href: "features", label: "Features" },
              { href: "workflow", label: "How It Works" },
              { href: "testimonials", label: "Testimonials" },
              { href: "pricing", label: "Pricing" },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={`#${href}`}
                onClick={(e) => {
                  handleSmoothScroll(e, href)
                  setIsMenuOpen(false)
                }}
                className={cn(
                  "text-sm font-medium transition-colors px-2 py-1.5 rounded-md cursor-pointer",
                  activeSection === href
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted hover:text-primary",
                )}
              >
                {label}
              </a>
            ))}
            <Link
              href="#"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Log in
            </Link>
            <Button className="w-full justify-center mt-2 bg-gradient-to-r from-primary to-purple-600">
              Add to Chrome
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </nav>
        </div>
      )}
    </header>
  )
}