document.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuButton");
  const closeButton = document.getElementById("closeMenuButton");
  const drawer = document.getElementById("sideDrawer");
  const overlay = document.getElementById("drawerOverlay");

  if (!menuButton || !closeButton || !drawer || !overlay) {
    console.warn("Menú lateral no inicializado: falta algún elemento HTML.");
    return;
  }

  function openDrawer() {
    drawer.classList.add("drawer-open");
    overlay.classList.add("overlay-visible");
    document.body.classList.add("no-scroll");

    menuButton.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    drawer.classList.remove("drawer-open");
    overlay.classList.remove("overlay-visible");
    document.body.classList.remove("no-scroll");

    menuButton.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
  }

  menuButton.addEventListener("click", openDrawer);
  closeButton.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeDrawer();
    }
  });

  closeDrawer();
});