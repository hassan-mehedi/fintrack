import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Freelance Designer",
    content:
      "FinTrack completely changed how I manage my freelance income. The budget tracking helps me save consistently, and the analytics show me exactly where my money goes.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "Software Engineer",
    content:
      "I've tried dozens of finance apps. FinTrack is the first one that's simple enough to actually use daily. The recurring transactions feature saves me so much time.",
    rating: 5,
  },
  {
    name: "Emily Rodriguez",
    role: "Small Business Owner",
    content:
      "The AI assistant is a game-changer. It spotted spending patterns I never noticed and helped me cut unnecessary expenses by 20%. Worth every penny of Pro.",
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 sm:py-28 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Testimonials</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Loved by thousands
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground">
            See what our users have to say about managing their finances with
            FinTrack.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="rounded-xl border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-warning text-warning"
                  />
                ))}
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground mb-6">
                &ldquo;{testimonial.content}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {testimonial.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <p className="text-sm font-medium">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
