/* ==========================================================================
   INITIALIZE ICONS & CORE SETTINGS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Set up skills animate status
    animateSkills();
    
    // Initialize project sliders
    initProjectSliders();
});

/* ==========================================================================
   THEME TOGGLE SYSTEM (DARK / LIGHT MODE)
   ========================================================================== */
const themeButton = document.getElementById('theme-toggle');
const darkThemeClass = 'dark-theme';
const lightThemeClass = 'light-theme';

// Retrieve previously selected theme from localStorage
const selectedTheme = localStorage.getItem('selected-theme');

// Set default theme state on load
if (selectedTheme === 'light') {
    document.body.classList.remove(darkThemeClass);
    document.body.classList.add(lightThemeClass);
} else {
    document.body.classList.add(darkThemeClass);
    document.body.classList.remove(lightThemeClass);
}

// Toggle theme on button click
if (themeButton) {
    themeButton.addEventListener('click', () => {
        if (document.body.classList.contains(lightThemeClass)) {
            document.body.classList.remove(lightThemeClass);
            document.body.classList.add(darkThemeClass);
            localStorage.setItem('selected-theme', 'dark');
        } else {
            document.body.classList.remove(darkThemeClass);
            document.body.classList.add(lightThemeClass);
            localStorage.setItem('selected-theme', 'light');
        }
    });
}

/* ==========================================================================
   MOBILE MENU / NAVBAR DRAWER
   ========================================================================== */
const navMenu = document.getElementById('nav-menu');
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.querySelectorAll('.nav-link');

if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('show-menu');
        
        // Toggle menu icon
        const icon = menuToggle.querySelector('i');
        if (icon) {
            if (navMenu.classList.contains('show-menu')) {
                icon.setAttribute('data-lucide', 'x');
            } else {
                icon.setAttribute('data-lucide', 'menu');
            }
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    });
}

// Close mobile menu when clicking any nav link
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (navMenu) {
            navMenu.classList.remove('show-menu');
        }
        
        // Reset toggle icon to menu
        const icon = menuToggle?.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', 'menu');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    });
});

/* ==========================================================================
   SCROLL ACTIONS: STICKY HEADER & SCROLL-TO-TOP & SCROLLSPY
   ========================================================================== */
const header = document.getElementById('header');
const scrollTopBtn = document.getElementById('scroll-to-top');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;

    // 1. Sticky Header
    if (header) {
        if (scrollY >= 50) {
            header.classList.add('scroll-header');
        } else {
            header.classList.remove('scroll-header');
        }
    }

    // 2. Show Scroll-To-Top Button
    if (scrollTopBtn) {
        if (scrollY >= 350) {
            scrollTopBtn.classList.add('show-scroll');
        } else {
            scrollTopBtn.classList.remove('show-scroll');
        }
    }

    // 3. Active Link Highlight (Scrollspy)
    sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 120;
        const sectionId = current.getAttribute('id');
        const activeLink = document.querySelector(`.nav-menu a[href*=${sectionId}]`);

        if (activeLink) {
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                activeLink.classList.add('active-link');
            } else {
                activeLink.classList.remove('active-link');
            }
        }
    });
});

/* ==========================================================================
   INTERACTIVE TABS (EXPERIENCE / EDUCATION / CERTIFICATIONS)
   ========================================================================== */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons
        tabButtons.forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        btn.classList.add('active');

        // Hide all panes
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        // Show target pane
        const targetId = btn.getAttribute('data-target');
        const targetPane = document.querySelector(targetId);
        if (targetPane) {
            targetPane.classList.add('active');
        }
    });
});

/* ==========================================================================
   SKILLS PROGRESS BAR FILL (INTERSECTION OBSERVER)
   ========================================================================== */
function animateSkills() {
    const skillBars = document.querySelectorAll('.skill-bar-fill');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const progress = bar.getAttribute('data-progress');
                bar.style.width = progress;
                // Once animated, stop tracking it
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.1 });

    skillBars.forEach(bar => {
        observer.observe(bar);
    });
}

/* ==========================================================================
   SKILLS CATEGORY FILTERING
   ========================================================================== */
const skillCatButtons = document.querySelectorAll('.skills-cat-btn');
const skillCards = document.querySelectorAll('.skill-card');

skillCatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Active button styles
        skillCatButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.getAttribute('data-category');

        skillCards.forEach(card => {
            const cardCat = card.getAttribute('data-category');
            
            if (category === 'all' || cardCat === category) {
                card.style.display = 'block';
                // Trigger smooth fade animation
                card.style.opacity = '0';
                setTimeout(() => {
                    card.style.opacity = '1';
                }, 50);
            } else {
                card.style.display = 'none';
            }
        });
    });
});

/* ==========================================================================
   PROJECTS CATEGORY FILTERING
   ========================================================================== */
const projectFilters = document.querySelectorAll('.filter-btn');
const projectCards = document.querySelectorAll('.project-card');

projectFilters.forEach(btn => {
    btn.addEventListener('click', () => {
        // Active button styling
        projectFilters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');

        projectCards.forEach(card => {
            const cardCategory = card.getAttribute('data-category');

            if (filter === 'all' || cardCategory === filter) {
                card.style.display = 'flex';
                // Smooth fade-in
                card.style.opacity = '0';
                card.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, 50);
            } else {
                card.style.display = 'none';
            }
        });
    });
});

/* ==========================================================================
   INTERACTIVE CONTACT FORM HANDLER (SIMULATED EMAIL)
   ========================================================================== */
const contactForm = document.getElementById('contact-form');
const toast = document.getElementById('toast-notification');

if (contactForm && toast) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Prevent page reload
        
        // Fetch values
        const nameVal = document.getElementById('name').value;
        const emailVal = document.getElementById('email').value;
        const subjectVal = document.getElementById('subject').value;
        const messageVal = document.getElementById('message').value;

        // Visual submit state on button
        const submitBtn = contactForm.querySelector('.btn-submit');
        const originalBtnHTML = submitBtn.innerHTML;
        
        submitBtn.innerHTML = `
            <span>Mengirim...</span>
            <i data-lucide="loader" class="animate-spin"></i>
        `;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        submitBtn.disabled = true;

        // Simulate network request (1.5 seconds delay)
        setTimeout(() => {
            // Restore button
            submitBtn.innerHTML = originalBtnHTML;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            submitBtn.disabled = false;

            // Open WhatsApp redirect in new tab with details!
            const waUrl = `https://wa.me/6289668468181?text=Halo%20Riansyah,%20nama%20saya%20${encodeURIComponent(nameVal)}%20(${encodeURIComponent(emailVal)}).%0A%0ASubjek:%20${encodeURIComponent(subjectVal)}%0A%0APesan:%20${encodeURIComponent(messageVal)}`;
            window.open(waUrl, '_blank');

            // Reset form inputs
            contactForm.reset();

            // Custom Toast Notification popup
            toast.classList.add('show-toast');

            // Hide Toast Notification after 4 seconds
            setTimeout(() => {
                toast.classList.remove('show-toast');
            }, 4000);
            
        }, 1500);
    });
}

/* ==========================================================================
   PROJECT IMAGE SLIDER ENGINE (CAROUSEL)
   ========================================================================== */
function initProjectSliders() {
    const sliders = document.querySelectorAll('.project-img-box.is-slider');
    
    sliders.forEach(slider => {
        const track = slider.querySelector('.slider-track');
        const slides = slider.querySelectorAll('.slide');
        const prevBtn = slider.querySelector('.slider-nav-btn.prev');
        const nextBtn = slider.querySelector('.slider-nav-btn.next');
        const dots = slider.querySelectorAll('.dot');
        
        let currentIndex = 0;
        const totalSlides = slides.length;
        
        function updateSlider(index) {
            // clamp index
            if (index < 0) index = totalSlides - 1;
            if (index >= totalSlides) index = 0;
            
            currentIndex = index;
            
            // Slide transition by moving the track horizontally
            track.style.transform = `translateX(-${currentIndex * (100 / totalSlides)}%)`;
            
            // Update dot visual states
            dots.forEach((dot, idx) => {
                if (idx === currentIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
        
        // Next button handler
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent card link navigation
                e.preventDefault();
                updateSlider(currentIndex + 1);
            });
        }
        
        // Previous button handler
        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                updateSlider(currentIndex - 1);
            });
        }
        
        // Dot indicator click handlers
        dots.forEach((dot, idx) => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                updateSlider(idx);
            });
        });
        
        // Swipe support for mobile touchscreen scroll snap behavior
        let startX = 0;
        let isSwiping = false;
        
        slider.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = true;
        }, { passive: true });
        
        slider.addEventListener('touchend', (e) => {
            if (!isSwiping) return;
            const endX = e.changedTouches[0].clientX;
            const diffX = startX - endX;
            
            // Swipe threshold 50px
            if (diffX > 50) {
                updateSlider(currentIndex + 1); // swipe left -> next
            } else if (diffX < -50) {
                updateSlider(currentIndex - 1); // swipe right -> prev
            }
            isSwiping = false;
        }, { passive: true });
    });
}
