"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Shield, Menu, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled ? "bg-background/95 backdrop-blur-md shadow-sm" : "bg-transparent",
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            TruthScope
          </span>
        </div>

        <nav className="hidden md:flex gap-8">
          <Link href="#features" className="text-sm font-medium transition-colors hover:text-primary relative group">
            Features
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link
            href="#testimonials"
            className="text-sm font-medium transition-colors hover:text-primary relative group"
          >
            Testimonials
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="#pricing" className="text-sm font-medium transition-colors hover:text-primary relative group">
            Pricing
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="#" className="text-sm font-medium transition-colors hover:text-primary relative group">
            Blog
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link href="#" className="text-sm font-medium transition-colors hover:text-primary">
            Log in
          </Link>
          <Button className="relative overflow-hidden group">
            <span className="relative z-10 flex items-center">
              Add to Chrome
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 opacity-0 transition-opacity group-hover:opacity-100" />
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {isMenuOpen && (
        <div className="container md:hidden py-4 border-t animate-in slide-in-from-top duration-300">
          <nav className="flex flex-col gap-4">
            <Link
              href="#features"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="#testimonials"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Testimonials
            </Link>
            <Link
              href="#pricing"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="#"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Blog
            </Link>
            <Link
              href="#"
              className="text-sm font-medium transition-colors hover:text-primary px-2 py-1.5 rounded-md hover:bg-muted"
              onClick={() => setIsMenuOpen(false)}
            >
              Log in
            </Link>
            <Button className="w-full justify-center mt-2">
              Add to Chrome
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </nav>
        </div>
      )}
    </header>
  )
}

