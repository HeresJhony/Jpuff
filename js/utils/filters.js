// js/utils/filters.js

let _products = [];
let _renderFn = null;

export function setupFilters(products, renderFn) {
    _products = products;
    _renderFn = renderFn;

    const filterControls = document.getElementById('filter-controls');
    if (!filterControls) return;

    filterControls.innerHTML = '';
    console.log("Filters v4.6 loaded");

    // Init Logic: Get full lists initially to populate dropdowns correctly first time
    const brands = getUniqueBrands(_products);
    const puffs = getUniquePuffs(_products);

    filterControls.innerHTML = `
        <input type="text" id="search-input" placeholder="Поиск...">
        <select id="brand-filter">
            <option value="">Все бренды</option>
            ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
        </select>
        <select id="puffs-filter">
            <option value="">Все затяжки</option>
            ${puffs.map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
    `;

    document.getElementById('search-input').addEventListener('input', applyFilters);

    const brandSelect = document.getElementById('brand-filter');
    const puffSelect = document.getElementById('puffs-filter');

    // BRAND CHANGED -> Update Puffs
    brandSelect.addEventListener('change', () => {
        updatePuffOptions();
        applyFilters();
    });

    // PUFF CHANGED -> Update Brands
    puffSelect.addEventListener('change', () => {
        updateBrandOptions();
        applyFilters();
    });
}

function getUniqueBrands(sourceProducts) {
    return [...new Set(sourceProducts.map(p => p.brand))].sort();
}

function getUniquePuffs(sourceProducts) {
    return [...new Set(sourceProducts.map(p => p.puffs))].sort((a, b) => Number(a) - Number(b));
}

function updatePuffOptions() {
    const brandSelect = document.getElementById('brand-filter');
    const puffSelect = document.getElementById('puffs-filter');

    const selectedBrand = brandSelect.value;
    const currentPuff = puffSelect.value;

    let subset = _products;
    if (selectedBrand) {
        subset = _products.filter(p => p.brand === selectedBrand);
    }

    const availablePuffs = getUniquePuffs(subset);

    // Rebuild Puff Options
    let html = '<option value="">Все затяжки</option>';
    html += availablePuffs.map(p => `<option value="${p}">${p}</option>`).join('');
    puffSelect.innerHTML = html;

    // Preserve selection if possible
    if (currentPuff && (availablePuffs.includes(Number(currentPuff)) || availablePuffs.includes(currentPuff))) {
        puffSelect.value = currentPuff;
    } else {
        puffSelect.value = "";
    }
}

function updateBrandOptions() {
    const brandSelect = document.getElementById('brand-filter');
    const puffSelect = document.getElementById('puffs-filter');

    const selectedPuff = puffSelect.value;
    const currentBrand = brandSelect.value;

    let subset = _products;
    if (selectedPuff) {
        subset = _products.filter(p => p.puffs.toString() === selectedPuff.toString());
    }

    const availableBrands = getUniqueBrands(subset);

    // Rebuild Brand Options
    let html = '<option value="">Все бренды</option>';
    html += availableBrands.map(b => `<option value="${b}">${b}</option>`).join('');
    brandSelect.innerHTML = html;

    // Preserve selection if possible
    if (currentBrand && availableBrands.includes(currentBrand)) {
        brandSelect.value = currentBrand;
    } else {
        brandSelect.value = "";
    }
}

export function applyFilters() {
    if (!_renderFn) return;

    const searchText = document.getElementById('search-input').value.toLowerCase();
    const brand = document.getElementById('brand-filter').value;
    const puff = document.getElementById('puffs-filter').value;

    const filtered = _products.filter(p => {
        return (p.model_name.toLowerCase().includes(searchText) || p.brand.toLowerCase().includes(searchText)) &&
            (!brand || p.brand === brand) &&
            (!puff || p.puffs.toString() === puff.toString());
    });

    _renderFn(filtered);
}
