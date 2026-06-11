// Efeitos da landing page: parallax no scroll, tilt 3D no mockup e
// reveal-on-scroll. Respeita prefers-reduced-motion.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

function init () {
  if (!document.querySelector(".lp-hero") || document.body.dataset.lpBooted) return
  document.body.dataset.lpBooted = "1"

  // -------------------------------------------------------------------------
  // Parallax: cada elemento [data-parallax] se move numa velocidade própria.
  // -------------------------------------------------------------------------
  const layers = [...document.querySelectorAll("[data-parallax]")]
  if (layers.length && !reduceMotion) {
    let ticking = false
    const apply = () => {
      ticking = false
      const y = window.scrollY
      for (const el of layers) {
        const speed = parseFloat(el.dataset.parallax) || 0
        el.style.transform = `translate3d(0, ${y * speed}px, 0)`
      }
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(apply) }
    }, { passive: true })
    apply()
  }

  // -------------------------------------------------------------------------
  // Tilt 3D sutil no mockup do editor, seguindo o mouse.
  // -------------------------------------------------------------------------
  const tilt = document.querySelector("[data-tilt]")
  if (tilt && !reduceMotion) {
    const hero = document.querySelector(".lp-hero")
    hero.addEventListener("mousemove", (e) => {
      const r = tilt.getBoundingClientRect()
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height
      tilt.style.setProperty("--tilt-x", `${(-dy * 4).toFixed(2)}deg`)
      tilt.style.setProperty("--tilt-y", `${(dx * 6).toFixed(2)}deg`)
    })
    hero.addEventListener("mouseleave", () => {
      tilt.style.setProperty("--tilt-x", "0deg")
      tilt.style.setProperty("--tilt-y", "0deg")
    })
  }

  // -------------------------------------------------------------------------
  // Reveal-on-scroll: elementos .reveal aparecem suavemente ao entrar na tela.
  // -------------------------------------------------------------------------
  const revealEls = [...document.querySelectorAll(".reveal")]
  if (reduceMotion) {
    revealEls.forEach((el) => el.classList.add("revealed"))
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed")
          io.unobserve(entry.target)
        }
      }
    }, { threshold: 0.12 })
    revealEls.forEach((el) => io.observe(el))
  }
}

init()
document.addEventListener("turbo:load", init)
