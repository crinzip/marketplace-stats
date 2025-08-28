/**
 * Elgato Marketplace Stats
 * 
 * A small tool for tracking download counts on Elgato Marketplace.
 * Made this for myself, but might be useful for others too.
 * 
 * Written by Claude 3.7
 * Curated by @crinzip / crin.zip
 * 
 */

document.addEventListener('DOMContentLoaded', () => {
  // App configuration
  const CONFIG = {
    COOLDOWN_PERIOD: 60 * 1000,
    API_FETCH_INTERVAL: 3000,
    USD_TO_EURO_RATE: 0.93,
    API_ENDPOINTS: {
      PRODUCTS_SEARCH: 'https://mp-gateway.elgato.com/products',
      PRODUCT_DETAILS: 'https://mp-gateway.elgato.com/products/{productId}',
    },
    STORAGE_KEYS: {
      TRACKED_PRODUCTS: 'trackedProducts',
      CATEGORIES: 'productCategories',
      LAST_COLLECTION: 'lastDailyCollection',
      PAID_ONLY: 'paidOnlyFilter' // Added new key for Paid Only toggle state
    },
    TRENDING_ITEMS_PER_PAGE: 3 // Number of trending items to show per page
  };

  // DOM Elements
  const DOM = {
    analytics: document.getElementById('analyticsContent'),
    trackProductBtn: document.getElementById('trackProductButton'),
    addCategoryBtn: document.getElementById('addCategoryButton'),
    exportDataBtn: document.getElementById('exportDataButton'),
    importDataBtn: document.getElementById('importDataButton'),
    fetchAllBtn: document.getElementById('fetchAllButton'),
    categoriesContainer: document.getElementById('categoriesContainer'),
    uncategorizedGrid: document.getElementById('uncategorizedGrid'),
    errorContainer: document.getElementById('errorContainer'),
    errorMessage: document.getElementById('errorMessage'),
    noProductsMessage: document.getElementById('noProductsMessage'),
    loadingIndicator: document.getElementById('globalLoadingIndicator'),
    
    templates: {
      productCard: document.getElementById('productCardTemplate'),
      category: document.getElementById('categoryTemplate'),
      trendingProduct: document.getElementById('trendingProductTemplate')
    },
    
    modals: {
      trackProduct: document.getElementById('trackProductModal'),
      category: document.getElementById('categoryModal'),
      product: document.getElementById('productModal'),
      importData: document.getElementById('importDataModal')
    },
    
    productModal: {
      title: document.getElementById('modalTitle'),
      marketplaceLink: document.getElementById('modalMarketplaceLink'),
      downloadCount: document.getElementById('modalDownloadCount'),
      timeRange: document.getElementById('modalTimeRange'),
      chartCanvas: document.getElementById('modalChart'),
      noDataMessage: document.getElementById('modalNoDataMessage'),
      dailyChangesChart: document.getElementById('dailyChangesChart'),
      dailyChangesNoDataMessage: document.getElementById('dailyChangesNoDataMessage'),
      viewDownloadsBtn: document.getElementById('viewDownloadsButton'),
      viewDailyChangesBtn: document.getElementById('viewDailyChangesButton'),
      downloadsChartContainer: document.getElementById('downloadsChartContainer'),
      dailyChangesChartContainer: document.getElementById('dailyChangesChartContainer')
    },
    
    productName: document.getElementById('productName'),
    searchButton: document.getElementById('searchButton'),
    categoryName: document.getElementById('categoryName'),
    addCategoryConfirmBtn: document.getElementById('addCategoryConfirmButton'),
    importFileInput: document.getElementById('importFileInput'),
    importConfirmBtn: document.getElementById('importConfirmButton'),
    
    trending: {
      section: document.getElementById('trendingSection'),
      periodButtons: document.querySelectorAll('.period-button'),
      paidOnlyToggle: document.getElementById('paidOnlyToggle'),
      productsList: document.getElementById('trendingProductsList'),
      prevButton: document.getElementById('trendingPrevButton'),
      nextButton: document.getElementById('trendingNextButton'),
      currentPage: document.getElementById('trendingCurrentPage'),
      totalPages: document.getElementById('trendingTotalPages')
    },
    
    totalDownloads: document.getElementById('totalDownloads'),
    uncategorizedDownloads: document.getElementById('uncategorizedDownloads'),
    productsHeader: document.querySelector('.products-header'),
    productsContainer: document.getElementById('allProductsContainer'),
    sectionToggle: document.querySelector('.section-toggle'),
    allProductsCount: document.getElementById('allProductsCount'),
    uncategorizedCount: document.getElementById('uncategorizedCount')
  };

  // App state
  const state = {
    trackedProducts: {},
    categories: {},
    productCooldowns: {},
    activeModalChart: null,
    activeDailyChangesChart: null,
    currentProductId: null,
    draggedProduct: null,
    draggedCategory: null,
    isFetchingAll: false,
    fetchQueue: [],
    usdToEuroRate: CONFIG.USD_TO_EURO_RATE,
    currentTrendingPeriod: 'week',
    showPaidOnly: false,
    currentChartView: 'downloads',
    trendingCurrentPage: 1,
    trendingTotalPages: 1,
    trendingProducts: []
  };

  // Initialize the app
  initEventListeners();
  loadData();
  checkForDailyCollection();
  
  // Handle visibility change to refresh data when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadData();
    }
  });
  
  // Setup drag and drop for uncategorized grid
  if (DOM.uncategorizedGrid) {
    setupDragDropForContainer(DOM.uncategorizedGrid);
  }
  
  // Initialize all event listeners
  function initEventListeners() {
    // Toggle product section visibility
    if (DOM.productsHeader) {
      DOM.productsHeader.addEventListener('click', toggleProductsSection);
    }
    
    // Trending section period buttons
    if (DOM.trending.periodButtons) {
      DOM.trending.periodButtons.forEach(button => {
        button.addEventListener('click', () => {
          DOM.trending.periodButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          state.currentTrendingPeriod = button.dataset.period;
          updateTrendingProducts();
        });
      });
    }
    
    // Paid only toggle for trending
    if (DOM.trending.paidOnlyToggle) {
      DOM.trending.paidOnlyToggle.addEventListener('change', () => {
        state.showPaidOnly = DOM.trending.paidOnlyToggle.checked;
        // Save the state to localStorage
        localStorage.setItem(CONFIG.STORAGE_KEYS.PAID_ONLY, state.showPaidOnly);
        updateTrendingProducts();
        updateSummaryStats();
      });
    }
    
    // Trending navigation buttons
    if (DOM.trending.prevButton && DOM.trending.nextButton) {
      DOM.trending.prevButton.addEventListener('click', () => navigateTrendingProducts('prev'));
      DOM.trending.nextButton.addEventListener('click', () => navigateTrendingProducts('next'));
    }
    
    // Chart view toggles
    if (DOM.productModal.viewDownloadsBtn && DOM.productModal.viewDailyChangesBtn) {
      DOM.productModal.viewDownloadsBtn.addEventListener('click', () => setChartView('downloads'));
      DOM.productModal.viewDailyChangesBtn.addEventListener('click', () => setChartView('daily'));
    }
    
    // Modal open buttons
    if (DOM.trackProductBtn && DOM.modals.trackProduct) {
      DOM.trackProductBtn.addEventListener('click', () => openModal(DOM.modals.trackProduct));
    }
    
    if (DOM.addCategoryBtn && DOM.modals.category) {
      DOM.addCategoryBtn.addEventListener('click', () => openModal(DOM.modals.category));
    }
    
    if (DOM.exportDataBtn) {
      DOM.exportDataBtn.addEventListener('click', exportData);
    }
    
    if (DOM.importDataBtn && DOM.modals.importData) {
      DOM.importDataBtn.addEventListener('click', () => openModal(DOM.modals.importData));
    }
    
    if (DOM.fetchAllBtn) {
      DOM.fetchAllBtn.addEventListener('click', () => {
        if (!state.isFetchingAll) {
          startFetchAll();
        } else {
          showError('Already fetching data. Please wait for completion.');
        }
      });
    }
    
    if (DOM.importConfirmBtn) {
      DOM.importConfirmBtn.addEventListener('click', importData);
    }
    
    // Search product functionality
    if (DOM.searchButton) {
      DOM.searchButton.addEventListener('click', searchProduct);
      if (DOM.productName) {
        DOM.productName.addEventListener('keypress', e => { 
          if (e.key === 'Enter') searchProduct(); 
        });
      }
    }
    
    // Add category functionality
    if (DOM.addCategoryConfirmBtn) {
      DOM.addCategoryConfirmBtn.addEventListener('click', addNewCategory);
      if (DOM.categoryName) {
        DOM.categoryName.addEventListener('keypress', e => { 
          if (e.key === 'Enter') addNewCategory(); 
        });
      }
    }
    
    // Close buttons for modals
    document.querySelectorAll('.close-button').forEach(button => {
      button.addEventListener('click', () => closeModal(button.closest('.modal')));
    });
    
    // Close modal when clicking outside content
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeModal(modal);
      });
    });
    
    // Time range selector for charts
    if (DOM.productModal.timeRange) {
      DOM.productModal.timeRange.addEventListener('change', () => {
        if (state.currentProductId) {
          if (state.currentChartView === 'downloads') {
            renderModalChart(state.currentProductId);
          } else {
            renderDailyChangesChart(state.currentProductId);
          }
        }
      });
    }
  }
  
  // Toggle the products section collapse/expand
  function toggleProductsSection() {
    if (DOM.productsContainer && DOM.sectionToggle) {
      DOM.productsContainer.classList.toggle('collapsed');
      DOM.sectionToggle.classList.toggle('collapsed');
    }
  }
  
  // Set the chart view (downloads or daily changes)
  function setChartView(view) {
    state.currentChartView = view;
    
    if (DOM.productModal.viewDownloadsBtn) {
      DOM.productModal.viewDownloadsBtn.classList.toggle('active', view === 'downloads');
    }
    
    if (DOM.productModal.viewDailyChangesBtn) {
      DOM.productModal.viewDailyChangesBtn.classList.toggle('active', view === 'daily');
    }
    
    if (DOM.productModal.downloadsChartContainer) {
      DOM.productModal.downloadsChartContainer.classList.toggle('hidden', view !== 'downloads');
    }
    
    if (DOM.productModal.dailyChangesChartContainer) {
      DOM.productModal.dailyChangesChartContainer.classList.toggle('hidden', view !== 'daily');
    }
    
    if (state.currentProductId) {
      if (view === 'downloads') {
        renderModalChart(state.currentProductId);
      } else {
        renderDailyChangesChart(state.currentProductId);
      }
    }
  }
  
  // Update product counts in UI
  function updateProductCounts() {
    // Update uncategorized count and downloads
    if (DOM.uncategorizedCount) {
      let count = 0;
      let totalDownloads = 0;
      
      for (const productId in state.trackedProducts) {
        const product = state.trackedProducts[productId];
        // Skip if paid only is checked and the product is free
        if (state.showPaidOnly && (!product.unitAmount || product.unitAmount <= 0)) continue;
        
        let inCategory = false;
        for (const catId in state.categories) {
          if (state.categories[catId].products && state.categories[catId].products.includes(productId)) {
            inCategory = true;
            break;
          }
        }
        if (!inCategory) {
          count++;
          totalDownloads += product.downloadCount || 0;
        }
      }
      
      DOM.uncategorizedCount.textContent = `${count} product${count !== 1 ? 's' : ''}`;
      
      if (DOM.uncategorizedDownloads) {
        DOM.uncategorizedDownloads.textContent = `${totalDownloads.toLocaleString()} download${totalDownloads !== 1 ? 's' : ''}`;
      }
    }
    
    // Update total count - don't filter product count by paid status
    if (DOM.allProductsCount) {
      const totalCount = Object.keys(state.trackedProducts).length;
      DOM.allProductsCount.textContent = `${totalCount} product${totalCount !== 1 ? 's' : ''}`;
    }
    
    // Update category download counts
    for (const categoryId in state.categories) {
      updateCategoryDownloadsCount(categoryId);
    }
  }
  
  // Update the download count for a category
  function updateCategoryDownloadsCount(categoryId) {
    if (!state.categories[categoryId]) return;
    
    const categoryElement = document.querySelector(`.category[data-category-id="${categoryId}"]`);
    if (!categoryElement) return;
    
    const downloadsCountElement = categoryElement.querySelector('.category-downloads-count');
    if (downloadsCountElement) {
      let totalDownloads = 0;
      
      state.categories[categoryId].products.forEach(productId => {
        const product = state.trackedProducts[productId];
        if (product) {
          // Only include paid products if showPaidOnly is true
          if (!state.showPaidOnly || (product.unitAmount && product.unitAmount > 0)) {
            totalDownloads += product.downloadCount || 0;
          }
        }
      });
      
      downloadsCountElement.textContent = `${totalDownloads.toLocaleString()} download${totalDownloads !== 1 ? 's' : ''}`;
    }
  }
  
  // Add a new category
  function addNewCategory() {
    if (!DOM.categoryName) return;
    
    const categoryName = DOM.categoryName.value.trim();
    
    if (!categoryName) {
      showError('Please enter a category name');
      return;
    }
    
    const categoryExists = Object.values(state.categories).some(cat => 
      cat.name.toLowerCase() === categoryName.toLowerCase()
    );
    
    const existingCategoryElement = Array.from(document.querySelectorAll('.category-title')).find(
      el => el.textContent.toLowerCase() === categoryName.toLowerCase()
    );
    
    if (categoryExists || existingCategoryElement) {
      showError('A category with this name already exists');
      return;
    }
    
    const categoryId = 'category_' + Date.now();
    
    state.categories[categoryId] = {
      name: categoryName,
      products: [],
      sortBy: 'default'
    };
    
    createCategoryElement(categoryId, categoryName);
    
    DOM.categoryName.value = '';
    closeModal(DOM.modals.category);
    
    saveCategories();
  }
  
  // Create a category DOM element
  function createCategoryElement(categoryId, categoryName) {
    if (!DOM.templates.category || !DOM.categoriesContainer) return null;
    
    const template = DOM.templates.category.content.cloneNode(true);
    const categoryElement = template.querySelector('.category');
    
    categoryElement.dataset.categoryId = categoryId;
    categoryElement.querySelector('.category-title').textContent = categoryName;
    
    const productsGrid = categoryElement.querySelector('.products-grid');
    productsGrid.dataset.categoryId = categoryId;
    
    const productCount = categoryElement.querySelector('.category-product-count');
    if (productCount && state.categories[categoryId] && state.categories[categoryId].products) {
      productCount.textContent = `${state.categories[categoryId].products.length} products`;
    }
    
    const downloadsCount = categoryElement.querySelector('.category-downloads-count');
    if (downloadsCount) {
      let totalDownloads = 0;
      state.categories[categoryId].products.forEach(productId => {
        if (state.trackedProducts[productId]) {
          totalDownloads += state.trackedProducts[productId].downloadCount || 0;
        }
      });
      
      downloadsCount.textContent = `${totalDownloads.toLocaleString()} download${totalDownloads !== 1 ? 's' : ''}`;
    }
    
    const sortDropdown = categoryElement.querySelector('.category-sort');
    if (sortDropdown) {
      sortDropdown.dataset.categoryId = categoryId;
      sortDropdown.value = state.categories[categoryId]?.sortBy || 'default';
      
      sortDropdown.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent category collapse when clicking dropdown
      });
      
      sortDropdown.addEventListener('change', () => {
        const sortBy = sortDropdown.value;
        state.categories[categoryId].sortBy = sortBy;
        sortCategoryProducts(categoryId, sortBy);
        saveCategories();
      });
    }
    
    const removeButton = categoryElement.querySelector('.remove-category-button');
    if (removeButton) {
      removeButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent category collapse when clicking remove
        showConfirmationDialog(
          `Are you sure you want to delete category "${categoryName}"?`,
          () => removeCategory(categoryId)
        );
      });
    }
    
    DOM.categoriesContainer.appendChild(categoryElement);
    
    setupDragDropForContainer(productsGrid);
    
    return categoryElement;
  }
  
  // Update the product count for a category
  function updateCategoryProductCount(categoryId) {
    if (!state.categories[categoryId]) return;
    
    const categoryElement = document.querySelector(`.category[data-category-id="${categoryId}"]`);
    if (!categoryElement) return;
    
    const productCountElement = categoryElement.querySelector('.category-product-count');
    if (productCountElement) {
      const count = state.categories[categoryId].products.length;
      productCountElement.textContent = `${count} product${count !== 1 ? 's' : ''}`;
    }
    
    // Also update the downloads count
    updateCategoryDownloadsCount(categoryId);
  }
  
  // Sort products within a category
  function sortCategoryProducts(categoryId, sortBy) {
    if (!state.categories[categoryId] || !state.categories[categoryId].products) return;
    
    const productsGrid = document.querySelector(`.products-grid[data-category-id="${categoryId}"]`);
    if (!productsGrid) return;
    
    const productCards = [...productsGrid.querySelectorAll('.product-card')];
    
    if (productCards.length <= 1) return;
    
    productCards.sort((a, b) => {
      const productIdA = a.dataset.productId;
      const productIdB = b.dataset.productId;
      
      const productA = state.trackedProducts[productIdA];
      const productB = state.trackedProducts[productIdB];
      
      if (!productA || !productB) return 0;
      
      switch (sortBy) {
        case 'newest':
          return parseInt(productIdB) - parseInt(productIdA);
          
        case 'most-downloads':
          return productB.downloadCount - productA.downloadCount;
          
        case 'least-downloads':
          return productA.downloadCount - productB.downloadCount;
          
        default:
          const indexA = state.categories[categoryId].products.indexOf(productIdA);
          const indexB = state.categories[categoryId].products.indexOf(productIdB);
          return indexA - indexB;
      }
    });
    
    productCards.forEach(card => productsGrid.appendChild(card));
  }
  
  // Show a confirmation dialog
  function showConfirmationDialog(message, confirmCallback) {
    let confirmationModal = document.getElementById('confirmationModal');
    
    if (!confirmationModal) {
      confirmationModal = document.createElement('div');
      confirmationModal.id = 'confirmationModal';
      confirmationModal.className = 'modal';
      
      confirmationModal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>Confirmation</h2>
            <button class="close-button" type="button" aria-label="Close">×</button>
          </div>
          <div class="modal-body">
            <p id="confirmationMessage"></p>
            <div class="modal-actions-bottom">
              <button id="confirmCancelButton" class="secondary-button">Cancel</button>
              <button id="confirmButton" class="primary-button">Confirm</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(confirmationModal);
      
      confirmationModal.querySelector('.close-button').addEventListener('click', () => {
        closeModal(confirmationModal);
      });
      
      confirmationModal.addEventListener('click', e => {
        if (e.target === confirmationModal) closeModal(confirmationModal);
      });
      
      document.getElementById('confirmCancelButton').addEventListener('click', () => {
        closeModal(confirmationModal);
      });
    }
    
    document.getElementById('confirmationMessage').textContent = message;
    
    const confirmButton = document.getElementById('confirmButton');
    
    const newConfirmButton = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
    
    newConfirmButton.addEventListener('click', () => {
      closeModal(confirmationModal);
      if (typeof confirmCallback === 'function') {
        confirmCallback();
      }
    });
    
    openModal(confirmationModal);
  }
  
  // Setup drag and drop functionality for a container
  function setupDragDropForContainer(container) {
    if (!container) return;
    
    container.addEventListener('dragover', e => {
      e.preventDefault();
      container.classList.add('drag-over');
    });
    
    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });
    
    container.addEventListener('drop', e => {
      e.preventDefault();
      container.classList.remove('drag-over');
      
      if (state.draggedProduct && state.draggedProduct.dataset.productId) {
        const productId = state.draggedProduct.dataset.productId;
        
        let targetCategoryId;
        if (container === DOM.uncategorizedGrid) {
          targetCategoryId = 'uncategorized';
        } else {
          targetCategoryId = container.dataset.categoryId;
        }
        
        let sourceCategoryId;
        const sourceContainer = state.draggedProduct.closest('.products-grid');
        if (sourceContainer === DOM.uncategorizedGrid) {
          sourceCategoryId = 'uncategorized';
        } else {
          sourceCategoryId = sourceContainer.dataset.categoryId;
        }
        
        if (sourceCategoryId !== targetCategoryId) {
          moveProductToCategory(productId, sourceCategoryId, targetCategoryId);
        }
      }
    });
  }
  
  // Move a product from one category to another
  function moveProductToCategory(productId, sourceCategoryId, targetCategoryId) {
    if (sourceCategoryId === 'uncategorized') {
      if (state.categories[targetCategoryId]) {
        state.categories[targetCategoryId].products.push(productId);
        updateCategoryProductCount(targetCategoryId);
      }
    } else if (targetCategoryId === 'uncategorized') {
      if (state.categories[sourceCategoryId]) {
        state.categories[sourceCategoryId].products = state.categories[sourceCategoryId].products.filter(id => id !== productId);
        updateCategoryProductCount(sourceCategoryId);
      }
    } else {
      if (state.categories[sourceCategoryId]) {
        state.categories[sourceCategoryId].products = state.categories[sourceCategoryId].products.filter(id => id !== productId);
        updateCategoryProductCount(sourceCategoryId);
      }
      if (state.categories[targetCategoryId]) {
        state.categories[targetCategoryId].products.push(productId);
        updateCategoryProductCount(targetCategoryId);
      }
    }
    
    const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (productCard) {
      let targetGrid;
      
      if (targetCategoryId === 'uncategorized') {
        targetGrid = DOM.uncategorizedGrid;
      } else {
        targetGrid = document.querySelector(`.products-grid[data-category-id="${targetCategoryId}"]`);
      }
      
      if (targetGrid) {
        const placeholder = targetGrid.querySelector('.category-placeholder, .info-message');
        if (placeholder) {
          placeholder.remove();
        }
        
        targetGrid.appendChild(productCard);
      }
    }
    
    if (sourceCategoryId !== 'uncategorized') {
      updateCategoryPlaceholder(sourceCategoryId);
    }
    
    updateProductCounts();
    
    if (DOM.uncategorizedGrid && DOM.uncategorizedGrid.querySelectorAll('.product-card').length === 0) {
      if (!DOM.uncategorizedGrid.querySelector('.info-message')) {
        const message = document.createElement('div');
        message.className = 'info-message';
        message.textContent = 'No uncategorized products.';
        DOM.uncategorizedGrid.appendChild(message);
      }
    }
    
    if (targetCategoryId !== 'uncategorized' && state.categories[targetCategoryId] && state.categories[targetCategoryId].sortBy !== 'default') {
      sortCategoryProducts(targetCategoryId, state.categories[targetCategoryId].sortBy);
    }
    
    saveCategories();
    updateTrendingProducts();
  }
  
  // Update category placeholder when empty
  function updateCategoryPlaceholder(categoryId) {
    if (!state.categories[categoryId]) return;
    
    const grid = document.querySelector(`.products-grid[data-category-id="${categoryId}"]`);
    if (!grid) return;
    
    const hasProducts = grid.querySelectorAll('.product-card').length > 0;
    let placeholder = grid.querySelector('.category-placeholder');
    
    if (!hasProducts && !placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'category-placeholder';
      placeholder.textContent = 'Drag products here';
      grid.appendChild(placeholder);
    } else if (hasProducts && placeholder) {
      placeholder.remove();
    }
  }
  
  // Remove a category
  function removeCategory(categoryId) {
    if (categoryId === 'default') return;
    
    if (state.categories[categoryId] && state.categories[categoryId].products.length > 0) {
      const productIds = [...state.categories[categoryId].products];
      productIds.forEach(productId => {
        moveProductToCategory(productId, categoryId, 'uncategorized');
      });
    }
    
    delete state.categories[categoryId];
    
    const categoryElement = document.querySelector(`.category[data-category-id="${categoryId}"]`);
    if (categoryElement) {
      categoryElement.remove();
    }
    
    saveCategories();
    updateTrendingProducts();
    updateProductCounts();
  }
  
  // Search for a product to track
  async function searchProduct() {
    if (!DOM.productName) return;
    
    const productName = DOM.productName.value.trim();
    
    if (!productName) {
      showError('Please enter a product name');
      return;
    }
    
    try {
      const productData = await fetchProductData(productName);
      if (!productData) return;
      
      if (state.trackedProducts[productData.productId]) {
        showError(`"${productData.name}" is already being tracked`);
        return;
      }
      
      const productDetails = await fetchProductDetails(productData.productId);
      if (!productDetails) return;
      
      addTrackedProduct(productData, productDetails);
      
      DOM.productName.value = '';
      closeModal(DOM.modals.trackProduct);
      
      updateSummaryStats();
      updateTrendingProducts();
      updateProductCounts();
      
    } catch (error) {
      showError('An unexpected error occurred');
    }
  }
  
  // Fetch product data from API
  async function fetchProductData(productName) {
    try {
      showLoading(true);
      
      const url = `${CONFIG.API_ENDPOINTS.PRODUCTS_SEARCH}?name=${encodeURIComponent(productName)}`;
      const response = await fetch(url);
      
      showLoading(false);
      
      if (response.status === 429) {
        showError('Rate limit exceeded. Please try again later');
        return null;
      }
      
      if (!response.ok) {
        showError(`API error: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data || !data.results || data.results.length === 0) {
        showError('Product not found. Please check the name');
        return null;
      }
      
      const product = data.results[0];
      
      // Check if the product has price information in the search results
      let unitAmount = 0;
      let currency = 'usd';
      
      if (product.variants && product.variants.length > 0) {
        // Find the default variant or use the first one
        const variant = product.variants.find(v => v.is_default) || product.variants[0];
        
        if (variant && variant.price) {
          unitAmount = variant.price.unit_amount || 0;
          currency = variant.price.currency || 'usd';
        }
      }
      
      return {
        name: product.name,
        orgId: product.organization_id,
        productId: product.id,
        marketplaceLink: `https://marketplace.elgato.com/product/${product.slug}`,
        // Pre-load price information if available in search results
        unitAmount: unitAmount,
        currency: currency
      };
    } catch (error) {
      showError('Failed to retrieve product data');
      showLoading(false);
      return null;
    }
  }
  
  // Fetch detailed product information
  async function fetchProductDetails(productId) {
    try {
      showLoading(true);
      
      const url = CONFIG.API_ENDPOINTS.PRODUCT_DETAILS
        .replace('{productId}', productId);
        
      const response = await fetch(url);
      
      showLoading(false);
      
      if (response.status === 429) {
        showError('Rate limit exceeded. Please try again later');
        return null;
      }
      
      if (!response.ok) {
        showError(`API error: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data) {
        showError('Failed to retrieve product details');
        return null;
      }
      
      // Extract the correct price from the variants array
      let unitAmount = 0;
      let currency = 'usd';
      
      // Check if the product has variants with pricing
      if (data.variants && data.variants.length > 0) {
        // Find the default variant or use the first one
        const variant = data.variants.find(v => v.is_default) || data.variants[0];
        
        if (variant && variant.price) {
          unitAmount = variant.price.unit_amount || 0;
          currency = variant.price.currency || 'usd';
        }
      }
      
      return {
        downloadCount: data.download_count || 0,
        unitAmount: unitAmount,
        currency: currency
      };
    } catch (error) {
      showError('Failed to retrieve product details');
      showLoading(false);
      return null;
    }
  }
  
  // Add a tracked product to the app
  function addTrackedProduct(productData, productDetails) {
    // If productData already has unitAmount/currency from search results,
    // and productDetails doesn't have them, use the ones from productData
    const unitAmount = productDetails.unitAmount || productData.unitAmount || 0;
    const currency = productDetails.currency || productData.currency || 'usd';
    
    state.trackedProducts[productData.productId] = {
      name: productData.name,
      orgId: productData.orgId,
      productId: productData.productId,
      marketplaceLink: productData.marketplaceLink,
      downloadCount: productDetails.downloadCount,
      unitAmount: unitAmount,
      currency: currency
    };
    
    createProductCard(
      {
        name: productData.name,
        productId: productData.productId,
        orgId: productData.orgId,
        marketplaceLink: productData.marketplaceLink
      },
      { 
        downloadCount: productDetails.downloadCount,
        unitAmount: unitAmount,
        currency: currency
      }
    );
    
    storeDownloadData(productData.productId, productDetails.downloadCount);
    
    if (DOM.noProductsMessage) {
      DOM.noProductsMessage.classList.add('hidden');
    }
    
    saveTrackedProducts();
    saveCategories();
  }
  
  // Create a product card element
  function createProductCard(productData, productDetails) {
    if (!DOM.templates.productCard || !DOM.uncategorizedGrid) return;
    
    const template = DOM.templates.productCard.content.cloneNode(true);
    const productCard = template.querySelector('.product-card');
    
    productCard.dataset.productId = productData.productId;
    template.querySelector('.product-title').textContent = productData.name;
    template.querySelector('.download-count').textContent = productDetails.downloadCount.toLocaleString();
    
    // Add price display with proper formatting
    const priceDisplay = template.querySelector('.price-display');
    if (priceDisplay) {
      priceDisplay.textContent = formatPrice(productDetails.unitAmount, productDetails.currency, true);
    }
    
    // Add price indicator if product is paid
    if (productDetails.unitAmount > 0) {
      const priceIndicator = document.createElement('span');
      priceIndicator.className = 'price-indicator';
      priceIndicator.innerHTML = '<i class="fas fa-tag"></i>';
      priceIndicator.title = formatPrice(productDetails.unitAmount, productDetails.currency);
      
      // Add it to the title-price-wrapper instead of the card-header
      const titleWrapper = template.querySelector('.title-price-wrapper');
      if (titleWrapper) {
        titleWrapper.appendChild(priceIndicator);
      }
    }
    
    productCard.addEventListener('dragstart', e => {
      state.draggedProduct = productCard;
      productCard.classList.add('dragging');
      e.dataTransfer.setData('text/plain', productData.productId);
    });
    
    productCard.addEventListener('dragend', () => {
      productCard.classList.remove('dragging');
      state.draggedProduct = null;
    });
    
    productCard.addEventListener('click', e => {
      if (!e.target.closest('.remove-button')) {
        openProductModal(productData.productId);
      }
    });
    
    const removeButton = template.querySelector('.remove-button');
    if (removeButton) {
      removeButton.addEventListener('click', e => {
        e.stopPropagation();
        showConfirmationDialog(
          `Are you sure you want to remove "${productData.name}"?`,
          () => removeProduct(productData.productId)
        );
      });
    }
    
    let targetGrid = DOM.uncategorizedGrid;
    let inCategory = false;
    
    for (const [catId, category] of Object.entries(state.categories)) {
      if (category.products && category.products.includes(productData.productId)) {
        const categoryGrid = document.querySelector(`.products-grid[data-category-id="${catId}"]`);
        if (categoryGrid) {
          targetGrid = categoryGrid;
          inCategory = true;
          updateCategoryProductCount(catId);
          break;
        }
      }
    }
    
    const placeholder = targetGrid.querySelector('.category-placeholder, .info-message');
    if (placeholder) {
      placeholder.remove();
    }
    
    targetGrid.appendChild(template);
    
    // Update uncategorized downloads count if needed
    if (!inCategory) {
      updateProductCounts();
    }
  }
  
  // Format price for display
  function formatPrice(unitAmount, currency, shortFormat = false) {
    // Explicit conversion to number to handle potential string input
    const numericUnitAmount = Number(unitAmount);
    
    if (!numericUnitAmount || numericUnitAmount <= 0) {
      return shortFormat ? '$0.00' : 'Free';
    }
    
    // Convert cents to dollars
    const amount = (numericUnitAmount / 100).toFixed(2);
    
    if (shortFormat) {
      return `$${amount}`;
    }
    
    if (currency && currency.toLowerCase() === 'usd') {
      const euroAmount = (numericUnitAmount / 100) * state.usdToEuroRate;
      return `$${amount} / €${euroAmount.toFixed(2)}`;
    } else if (currency && currency.toLowerCase() === 'eur') {
      return `€${amount}`;
    } else {
      return `${amount} ${currency ? currency.toUpperCase() : 'USD'}`;
    }
  }
  
  // Open the product details modal
  function openProductModal(productId) {
    const product = state.trackedProducts[productId];
    if (!product || !DOM.modals.product) return;
    
    state.currentProductId = productId;
    
    if (DOM.productModal.title) DOM.productModal.title.textContent = product.name;
    if (DOM.productModal.marketplaceLink) DOM.productModal.marketplaceLink.href = product.marketplaceLink;
    if (DOM.productModal.downloadCount) DOM.productModal.downloadCount.textContent = product.downloadCount.toLocaleString();
    
    // Set the initial chart view (downloads)
    setChartView('downloads');
    
    openModal(DOM.modals.product);
  }
  
  // Render the download history chart in the modal
  function renderModalChart(productId) {
    if (!DOM.productModal.timeRange || !DOM.productModal.chartCanvas || !DOM.productModal.noDataMessage) return;
    
    const timeRange = DOM.productModal.timeRange.value;
    const downloadHistory = getDownloadHistory(productId, timeRange);
    
    if (state.activeModalChart) {
      state.activeModalChart.destroy();
      state.activeModalChart = null;
    }
    
    if (downloadHistory.length === 0) {
      DOM.productModal.noDataMessage.classList.remove('hidden');
      DOM.productModal.chartCanvas.classList.add('hidden');
      return;
    }
    
    DOM.productModal.noDataMessage.classList.add('hidden');
    DOM.productModal.chartCanvas.classList.remove('hidden');
    
    const labels = downloadHistory.map(item => new Date(item.timestamp).toLocaleDateString());
    const data = downloadHistory.map(item => ({
      y: item.downloadCount,
      x: new Date(item.timestamp).toLocaleDateString(),
      timestamp: item.timestamp
    }));
    
    const ctx = DOM.productModal.chartCanvas.getContext('2d');
    
    state.activeModalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Download Count',
          data: data,
          borderColor: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 500
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(context) {
                const dataPoint = context[0].raw;
                return formatDateTime(dataPoint.timestamp);
              },
              label: function(context) {
                return `Downloads: ${context.formattedValue}`;
              }
            },
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#333333',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleFont: {
              size: 14,
              weight: 'bold'
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#f5f5f5' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y: {
            beginAtZero: true,
            ticks: { 
              color: '#f5f5f5',
              callback: function(value) {
                if (value === 0) return '0';
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
                return value;
              }
            },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        }
      }
    });
  }
  
  // Render the daily changes chart in the modal
  function renderDailyChangesChart(productId) {
    if (!DOM.productModal.dailyChangesChart || !DOM.productModal.dailyChangesNoDataMessage) return;
    
    const timeRange = DOM.productModal.timeRange ? DOM.productModal.timeRange.value : 'all';
    const downloadHistory = getDownloadHistory(productId, timeRange);
    
    if (state.activeDailyChangesChart) {
      state.activeDailyChangesChart.destroy();
      state.activeDailyChangesChart = null;
    }
    
    if (downloadHistory.length < 2) {
      DOM.productModal.dailyChangesNoDataMessage.classList.remove('hidden');
      DOM.productModal.dailyChangesChart.classList.add('hidden');
      return;
    }
    
    DOM.productModal.dailyChangesNoDataMessage.classList.add('hidden');
    DOM.productModal.dailyChangesChart.classList.remove('hidden');
    
    // Sort by timestamp and calculate daily changes
    downloadHistory.sort((a, b) => a.timestamp - b.timestamp);
    
    const dailyChanges = [];
    
    for (let i = 1; i < downloadHistory.length; i++) {
      const previousDay = downloadHistory[i - 1];
      const currentDay = downloadHistory[i];
      
      const change = currentDay.downloadCount - previousDay.downloadCount;
      
      dailyChanges.push({
        x: new Date(currentDay.timestamp).toLocaleDateString(),
        y: change,
        timestamp: currentDay.timestamp
      });
    }
    
    const ctx = DOM.productModal.dailyChangesChart.getContext('2d');
    
    state.activeDailyChangesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [{
          label: 'Daily Changes',
          data: dailyChanges,
          backgroundColor: ctx => {
            const value = ctx.raw.y;
            return value >= 0 ? 'rgba(76, 175, 80, 0.7)' : 'rgba(244, 67, 54, 0.7)';
          },
          borderColor: ctx => {
            const value = ctx.raw.y;
            return value >= 0 ? 'rgb(76, 175, 80)' : 'rgb(244, 67, 54)';
          },
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(context) {
                const dataPoint = context[0].raw;
                return formatDateTime(dataPoint.timestamp);
              },
              label: function(context) {
                const value = context.raw.y;
                return `Change: ${value > 0 ? '+' : ''}${value}`;
              }
            },
            backgroundColor: 'rgba(30, 30, 30, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#333333',
            borderWidth: 1,
            padding: 10,
            displayColors: false
          }
        },
        scales: {
          x: {
            ticks: { color: '#f5f5f5' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          },
          y: {
            ticks: { color: '#f5f5f5' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' }
          }
        }
      }
    });
  }
  
  // Format timestamp to readable date time
  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + 
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Remove a product
  function removeProduct(productId) {
    let categoryId = null;
    for (const catId in state.categories) {
      if (state.categories[catId].products && state.categories[catId].products.includes(productId)) {
        categoryId = catId;
        state.categories[catId].products = state.categories[catId].products.filter(id => id !== productId);
        updateCategoryProductCount(catId);
        break;
      }
    }
    
    delete state.trackedProducts[productId];
    delete state.productCooldowns[productId];
    
    const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (productCard) {
      productCard.remove();
    }
    
    if (state.currentProductId === productId && DOM.modals.product) {
      closeModal(DOM.modals.product);
    }
    
    if (categoryId) {
      updateCategoryPlaceholder(categoryId);
    }
    
    saveTrackedProducts();
    saveCategories();
    
    if (Object.keys(state.trackedProducts).length === 0 && DOM.noProductsMessage) {
      DOM.noProductsMessage.classList.remove('hidden');
    }
    
    updateSummaryStats();
    updateTrendingProducts();
    updateProductCounts();
  }
  
  // Start fetching all product data
  function startFetchAll() {
    if (state.isFetchingAll) return;
    
    const productIds = Object.keys(state.trackedProducts);
    
    if (productIds.length === 0) {
      showError('No products to fetch');
      return;
    }
    
    state.isFetchingAll = true;
    state.fetchQueue = [...productIds];
    
    showLoading(true, `Fetching 1/${productIds.length}`);
    
    processFetchQueue();
  }
  
  // Process the fetch queue
  function processFetchQueue() {
    if (state.fetchQueue.length === 0) {
      state.isFetchingAll = false;
      showLoading(false);
      updateSummaryStats();
      updateTrendingProducts();
      updateProductCounts();
      return;
    }
    
    const productId = state.fetchQueue.shift();
    const totalProducts = Object.keys(state.trackedProducts).length;
    const currentPosition = totalProducts - state.fetchQueue.length;
    
    showLoading(true, `Fetching ${currentPosition}/${totalProducts}`);
    
    fetchCurrentData(productId, false)
      .then(() => {
        setTimeout(() => {
          processFetchQueue();
        }, CONFIG.API_FETCH_INTERVAL);
      })
      .catch(() => {
        setTimeout(() => {
          processFetchQueue();
        }, CONFIG.API_FETCH_INTERVAL);
      });
  }
  
  // Show/hide loading indicator
  function showLoading(show, message = 'Loading...') {
    if (!DOM.loadingIndicator) return;
    
    if (show) {
      const loadingText = DOM.loadingIndicator.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = message;
      }
      DOM.loadingIndicator.classList.remove('hidden');
    } else {
      DOM.loadingIndicator.classList.add('hidden');
    }
  }
  
  // Fetch current data for a product
  async function fetchCurrentData(productId, applyCooldown = true) {
    try {
      const product = state.trackedProducts[productId];
      if (!product) return;
      
      if (applyCooldown) {
        setProductCooldown(productId);
      }
      
      const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
      if (productCard) {
        productCard.classList.add('loading');
      }
      
      const productDetails = await fetchProductDetails(product.productId);
      
      if (productCard) {
        productCard.classList.remove('loading');
      }
      
      if (productDetails) {
        product.downloadCount = productDetails.downloadCount;
        product.unitAmount = productDetails.unitAmount;
        product.currency = productDetails.currency || product.currency;
        
        if (productCard) {
          const downloadCountElement = productCard.querySelector('.download-count');
          if (downloadCountElement) {
            downloadCountElement.textContent = productDetails.downloadCount.toLocaleString();
          }
          
          const priceDisplay = productCard.querySelector('.price-display');
          if (priceDisplay) {
            priceDisplay.textContent = formatPrice(product.unitAmount, product.currency, true);
          }
          
          let priceIndicator = productCard.querySelector('.price-indicator');
          if (product.unitAmount > 0) {
            if (!priceIndicator) {
              priceIndicator = document.createElement('span');
              priceIndicator.className = 'price-indicator';
              priceIndicator.innerHTML = '<i class="fas fa-tag"></i>';
              
              // Add to title-price-wrapper instead of card-header
              const titleWrapper = productCard.querySelector('.title-price-wrapper');
              if (titleWrapper) {
                titleWrapper.appendChild(priceIndicator);
              }
            }
            priceIndicator.title = formatPrice(product.unitAmount, product.currency);
          } else if (priceIndicator) {
            priceIndicator.remove();
          }
        }
        
        if (state.currentProductId === productId) {
          if (DOM.productModal.downloadCount) {
            DOM.productModal.downloadCount.textContent = productDetails.downloadCount.toLocaleString();
          }
        }
        
        storeDownloadData(productId, productDetails.downloadCount);
        
        if (state.currentProductId === productId) {
          if (state.currentChartView === 'downloads') {
            renderModalChart(productId);
          } else {
            renderDailyChangesChart(productId);
          }
        }
        
        for (const categoryId in state.categories) {
          if (state.categories[categoryId].products.includes(productId) && state.categories[categoryId].sortBy !== 'default') {
            sortCategoryProducts(categoryId, state.categories[categoryId].sortBy);
          }
        }
        
        saveTrackedProducts();
        updateSummaryStats();
        updateTrendingProducts();
        updateProductCounts();
      }
    } catch (error) {
      const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
      if (productCard) {
        productCard.classList.remove('loading');
      }
      
      if (!state.isFetchingAll) {
        showError('Failed to fetch current data');
      }
      
      throw error;
    }
  }
  
  // Set cooldown for a product after fetching
  function setProductCooldown(productId) {
    state.productCooldowns[productId] = true;
    
    const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (productCard) {
      productCard.classList.add('cooldown');
    }
    
    setTimeout(() => {
      state.productCooldowns[productId] = false;
      
      if (productCard) {
        productCard.classList.remove('cooldown');
      }
    }, CONFIG.COOLDOWN_PERIOD);
  }
  
  // Show error message
  function showError(message) {
    if (!DOM.errorMessage || !DOM.errorContainer) return;
    
    DOM.errorMessage.textContent = message;
    DOM.errorContainer.classList.remove('hidden');
    
    setTimeout(() => {
      DOM.errorContainer.classList.add('hidden');
    }, 5000);
  }
  
  // Open a modal
  function openModal(modal) {
    if (!modal) return;
    
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }
  
  // Close a modal
  function closeModal(modal) {
    if (!modal) return;
    
    modal.classList.remove('active');
    setTimeout(() => {
      modal.classList.add('hidden');
      
      if (modal === DOM.modals.product) {
        if (state.activeModalChart) {
          state.activeModalChart.destroy();
          state.activeModalChart = null;
        }
        if (state.activeDailyChangesChart) {
          state.activeDailyChangesChart.destroy();
          state.activeDailyChangesChart = null;
        }
        state.currentProductId = null;
      }
    }, 300);
  }
  
  // Store download data for a product
  function storeDownloadData(productId, downloadCount) {
    const timestamp = Date.now();
    const storageKey = `product_${productId}_data`;
    
    let dataHistory = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const today = new Date().toDateString();
    const existingTodayIndex = dataHistory.findIndex(item => 
      new Date(item.timestamp).toDateString() === today
    );
    
    if (existingTodayIndex >= 0) {
      dataHistory[existingTodayIndex] = {
        timestamp,
        downloadCount
      };
    } else {
      dataHistory.push({
        timestamp,
        downloadCount
      });
    }
    
    localStorage.setItem(storageKey, JSON.stringify(dataHistory));
    
    return { timestamp, downloadCount };
  }
  
  // Get download history for a product
  function getDownloadHistory(productId, timeRange) {
    const storageKey = `product_${productId}_data`;
    
    let dataHistory = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    if (dataHistory.length === 0) {
      const oldKey = `plugin_${productId}_data`;
      dataHistory = JSON.parse(localStorage.getItem(oldKey) || '[]');
      
      if (dataHistory.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(dataHistory));
        localStorage.removeItem(oldKey);
      }
    }
    
    if (dataHistory.length === 0) {
      return [];
    }
    
    const now = Date.now();
    
    switch (timeRange) {
      case 'week':
        return dataHistory.filter(item => (now - item.timestamp) < 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return dataHistory.filter(item => (now - item.timestamp) < 30 * 24 * 60 * 60 * 1000);
      case 'year':
        return dataHistory.filter(item => (now - item.timestamp) < 365 * 24 * 60 * 60 * 1000);
      default:
        return dataHistory;
    }
  }
  
  // Save tracked products to local storage
  function saveTrackedProducts() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TRACKED_PRODUCTS, JSON.stringify(state.trackedProducts));
  }
  
  // Save categories to local storage
  function saveCategories() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CATEGORIES, JSON.stringify(state.categories));
  }
  
  // Navigate trending products (prev/next page)
  function navigateTrendingProducts(direction) {
    if (!DOM.trending.currentPage || !DOM.trending.totalPages) return;
    
    if (direction === 'prev' && state.trendingCurrentPage > 1) {
      state.trendingCurrentPage--;
    } else if (direction === 'next' && state.trendingCurrentPage < state.trendingTotalPages) {
      state.trendingCurrentPage++;
    } else {
      return; // Don't navigate beyond boundaries
    }
    
    displayTrendingPage(state.trendingCurrentPage);
  }
  
  // Display a specific page of trending products
  function displayTrendingPage(page) {
    if (!DOM.trending.productsList || !DOM.trending.currentPage || !DOM.trending.totalPages) return;
    
    // Update pagination UI
    DOM.trending.currentPage.textContent = page;
    
    // Calculate start and end index for the current page
    const startIndex = (page - 1) * CONFIG.TRENDING_ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + CONFIG.TRENDING_ITEMS_PER_PAGE, state.trendingProducts.length);
    
    // Clear current products
    while (DOM.trending.productsList.firstChild) {
      DOM.trending.productsList.removeChild(DOM.trending.productsList.firstChild);
    }
    
    // Add products for current page
    for (let i = startIndex; i < endIndex; i++) {
      const product = state.trendingProducts[i];
      const template = DOM.templates.trendingProduct.content.cloneNode(true);
      const productItem = template.querySelector('.trending-product-item');
      
      productItem.dataset.productId = product.productId;
      
      const nameElement = productItem.querySelector('.trending-product-name');
      if (nameElement) nameElement.textContent = product.name;
      
      const priceElement = productItem.querySelector('.trending-product-price');
      if (priceElement) {
        priceElement.textContent = formatPrice(product.unitAmount, product.currency, true);
      }
      
      const downloadElement = productItem.querySelector('.trending-download-count');
      if (downloadElement) {
        downloadElement.textContent = `+${product.increase}`;
      }
      
      productItem.addEventListener('click', () => {
        openProductModal(product.productId);
      });
      
      DOM.trending.productsList.appendChild(template);
    }
    
    // Update navigation buttons state
    if (DOM.trending.prevButton) {
      DOM.trending.prevButton.classList.toggle('disabled', page === 1);
    }
    
    if (DOM.trending.nextButton) {
      DOM.trending.nextButton.classList.toggle('disabled', page === state.trendingTotalPages);
    }
  }
  
  // Update trending products section
  function updateTrendingProducts() {
    if (!DOM.trending.productsList) return;
    
    // Calculate trending products
    state.trendingProducts = calculateTrendingProducts();
    
    // Clear current trending products
    while (DOM.trending.productsList.firstChild) {
      DOM.trending.productsList.removeChild(DOM.trending.productsList.firstChild);
    }
    
    if (state.trendingProducts.length === 0) {
      const message = document.createElement('div');
      message.className = 'info-message';
      message.textContent = 'No trending data available yet.';
      DOM.trending.productsList.appendChild(message);
      
      // Reset pagination
      state.trendingCurrentPage = 1;
      state.trendingTotalPages = 1;
      
      if (DOM.trending.currentPage) DOM.trending.currentPage.textContent = '1';
      if (DOM.trending.totalPages) DOM.trending.totalPages.textContent = '1';
      
      // Disable navigation buttons
      if (DOM.trending.prevButton) DOM.trending.prevButton.classList.add('disabled');
      if (DOM.trending.nextButton) DOM.trending.nextButton.classList.add('disabled');
      
      return;
    }
    
    // Calculate total pages
    state.trendingTotalPages = Math.ceil(state.trendingProducts.length / CONFIG.TRENDING_ITEMS_PER_PAGE);
    
    // Make sure current page is valid
    if (state.trendingCurrentPage > state.trendingTotalPages) {
      state.trendingCurrentPage = 1;
    }
    
    // Update total pages display
    if (DOM.trending.totalPages) DOM.trending.totalPages.textContent = state.trendingTotalPages;
    
    // Display the current page
    displayTrendingPage(state.trendingCurrentPage);
  }
  
  // Calculate trending products based on download increase
  function calculateTrendingProducts() {
    const trendingProducts = [];
    
    // Loop through all tracked products
    for (const productId in state.trackedProducts) {
      const product = state.trackedProducts[productId];
      
      // Skip if paid only is checked and the product is free
      if (state.showPaidOnly && (!product.unitAmount || product.unitAmount <= 0)) continue;
      
      const history = getDownloadHistory(productId, state.currentTrendingPeriod);
      
      if (history.length < 2) continue;
      
      // Sort by timestamp (oldest first)
      history.sort((a, b) => a.timestamp - b.timestamp);
      
      // Calculate the increase over the period
      const oldestInPeriod = history[0].downloadCount;
      const newest = history[history.length - 1].downloadCount;
      const increase = newest - oldestInPeriod;
      
      if (increase <= 0) continue;
      
      trendingProducts.push({
        productId,
        name: product.name,
        increase,
        downloadCount: product.downloadCount,
        unitAmount: product.unitAmount,
        currency: product.currency
      });
    }
    
    // Sort by increase (highest first)
    trendingProducts.sort((a, b) => b.increase - a.increase);
    
    return trendingProducts;
  }
  
  // Update total downloads in summary section
  function updateSummaryStats() {
    if (!DOM.totalDownloads) return;
    
    let downloads = 0;
    
    for (const productId in state.trackedProducts) {
      const product = state.trackedProducts[productId];
      
      // Only include paid products if showPaidOnly is true
      if (!state.showPaidOnly || (product.unitAmount && product.unitAmount > 0)) {
        downloads += product.downloadCount;
      }
    }
    
    DOM.totalDownloads.textContent = downloads.toLocaleString();
    
    // Update category download counts
    updateProductCounts();
  }
  
  // Load all data from local storage
  function loadData() {
    if (DOM.uncategorizedGrid) {
      while (DOM.uncategorizedGrid.firstChild) {
        DOM.uncategorizedGrid.removeChild(DOM.uncategorizedGrid.firstChild);
      }
    }
    
    if (DOM.categoriesContainer) {
      const categoryElements = DOM.categoriesContainer.querySelectorAll('.category');
      categoryElements.forEach(el => el.remove());
    }
    
    loadTrackedProducts();
    loadCategories();
    loadPaidOnlyState(); // Added to load the Paid Only toggle state
    updateSummaryStats();
    updateTrendingProducts();
    updateProductCounts();
  }
  
  // Load the Paid Only toggle state from localStorage
  function loadPaidOnlyState() {
    const savedState = localStorage.getItem(CONFIG.STORAGE_KEYS.PAID_ONLY);
    
    if (savedState !== null) {
      // Convert the string to boolean
      state.showPaidOnly = savedState === 'true';
      
      // Update the toggle UI to match the saved state
      if (DOM.trending.paidOnlyToggle) {
        DOM.trending.paidOnlyToggle.checked = state.showPaidOnly;
      }
    }
  }
  
  // Load tracked products from local storage
  function loadTrackedProducts() {
    const savedProducts = localStorage.getItem(CONFIG.STORAGE_KEYS.TRACKED_PRODUCTS);
    
    if (savedProducts) {
      try {
        const products = JSON.parse(savedProducts);
        
        Object.assign(state.trackedProducts, products);
        
        if (Object.keys(products).length > 0 && DOM.noProductsMessage) {
          DOM.noProductsMessage.classList.add('hidden');
        }
      } catch (error) {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TRACKED_PRODUCTS);
      }
    }
  }
  
  // Load categories from local storage
  function loadCategories() {
    const savedCategories = localStorage.getItem(CONFIG.STORAGE_KEYS.CATEGORIES);
    
    if (savedCategories) {
      try {
        const loadedCategories = JSON.parse(savedCategories);
        
        Object.assign(state.categories, loadedCategories);
        
        for (const [categoryId, category] of Object.entries(state.categories)) {
          createCategoryElement(categoryId, category.name);
        }
        
        for (const productId in state.trackedProducts) {
          const product = state.trackedProducts[productId];
          createProductCard(
            {
              name: product.name,
              productId: product.productId,
              orgId: product.orgId,
              marketplaceLink: product.marketplaceLink
            },
            { 
              downloadCount: product.downloadCount,
              unitAmount: product.unitAmount,
              currency: product.currency
            }
          );
        }
        
        for (const categoryId in state.categories) {
          updateCategoryPlaceholder(categoryId);
          updateCategoryProductCount(categoryId);
        }
        
        for (const categoryId in state.categories) {
          if (state.categories[categoryId].sortBy && state.categories[categoryId].sortBy !== 'default') {
            sortCategoryProducts(categoryId, state.categories[categoryId].sortBy);
          }
        }
      } catch (error) {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.CATEGORIES);
      }
    }
  }
  
  // Check if we need to collect data daily
  function checkForDailyCollection() {
    const lastCollection = localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_COLLECTION);
    const now = new Date();
    const today = now.toDateString();
    
    if (!lastCollection || new Date(lastCollection).toDateString() !== today) {
      if (Object.keys(state.trackedProducts).length === 0) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_COLLECTION, now.toString());
        return;
      }
      
      startFetchAll();
      localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_COLLECTION, now.toString());
    }
  }
  
  // Export data to a JSON file
  function exportData() {
    try {
      const exportData = {
        trackedProducts: state.trackedProducts,
        categories: state.categories,
        downloadHistory: {}
      };
      
      for (const productId in state.trackedProducts) {
        const storageKey = `product_${productId}_data`;
        const dataHistory = JSON.parse(localStorage.getItem(storageKey) || '[]');
        exportData.downloadHistory[productId] = dataHistory;
      }
      
      const jsonData = JSON.stringify(exportData, null, 2);
      
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `elgato-marketplace-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      showError('Failed to export data');
    }
  }
  
  // Import data from a JSON file
  function importData() {
    try {
      if (!DOM.importFileInput) {
        showError('Import file input not found');
        return;
      }
      
      const file = DOM.importFileInput.files[0];
      if (!file) {
        showError('Please select a file to import');
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const importedData = JSON.parse(e.target.result);
          
          if (!importedData.trackedProducts || !importedData.categories) {
            showError('Invalid data format');
            return;
          }
          
          for (const productId in state.trackedProducts) {
            const card = document.querySelector(`.product-card[data-product-id="${productId}"]`);
            if (card) card.remove();
          }
          
          document.querySelectorAll('.category').forEach(category => {
            category.remove();
          });
          
          Object.assign(state.trackedProducts, importedData.trackedProducts);
          Object.assign(state.categories, importedData.categories);
          
          if (importedData.downloadHistory) {
            for (const productId in importedData.downloadHistory) {
              const storageKey = `product_${productId}_data`;
              localStorage.setItem(storageKey, JSON.stringify(importedData.downloadHistory[productId]));
            }
          }
          
          loadData();
          
          saveTrackedProducts();
          saveCategories();
          
          closeModal(DOM.modals.importData);
          
          DOM.importFileInput.value = '';
          
        } catch (error) {
          showError('Invalid JSON format');
        }
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      showError('Failed to import data');
    }
  }
});