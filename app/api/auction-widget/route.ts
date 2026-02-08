import { NextResponse } from 'next/server'

export async function GET() {
  // This serves the auction widget JavaScript that embeds on Shopify product pages

  const widgetScript = `
(function() {
  'use strict';
  
  const API_BASE = '${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}';
  const SUPABASE_URL = '${process.env.NEXT_PUBLIC_SUPABASE_URL}';
  const SUPABASE_ANON_KEY = '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}';
  const FIREBASE_CONFIG = {
    apiKey: '${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}',
    authDomain: '${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}',
    projectId: '${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}',
    appId: '${process.env.NEXT_PUBLIC_FIREBASE_APP_ID}'
  };
  
  let firebaseApp = null;
  let firebaseAuth = null;
  let currentProductId = null;
  let widgetState = 'loading'; // loading | otp | verifyOtp | register | bid
  let confirmationResult = null;
  let verifiedPhone = null;
  let verifiedEmail = null;
  let verifiedName = null;
  let firebaseIdToken = null;
  
  // Get product ID from merchant injection
  currentProductId = window.AUCTION_PRODUCT_ID;
  if (!currentProductId) {
    console.log('Auction widget: No product ID found. Merchant must inject window.AUCTION_PRODUCT_ID');
    return;
  }
  
  // Load Firebase
  const firebaseScript = document.createElement('script');
  firebaseScript.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js';
  firebaseScript.onload = () => {
    const authScript = document.createElement('script');
    authScript.src = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js';
    authScript.onload = () => {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      firebaseAuth = firebase.auth();
      firebaseAuth.useDeviceLanguage();
      
      // Check if auction exists for this product
      fetch(API_BASE + '/api/auction/product/' + currentProductId)
        .then(res => res.json())
        .then(auction => {
          if (auction.id && auction.status === 'live') {
            initAuctionWidget(auction);
          }
        })
        .catch(err => console.log('Auction widget: No auction found'));
    };
    document.head.appendChild(authScript);
  };
  document.head.appendChild(firebaseScript);
  
  function initAuctionWidget(auction) {
    // Check if registration window is closed
    const now = new Date();
    const registrationEnd = new Date(auction.registration_end_time);
    const isRegistrationClosed = now > registrationEnd;
    
    // Check for existing verified user
    const savedPhone = localStorage.getItem('auction_user_phone');
    const savedEmail = localStorage.getItem('auction_user_email');
    const savedName = localStorage.getItem('auction_user_name');
    const existingBidderId = localStorage.getItem('bidder_' + auction.id);
    
    // Create widget HTML
    const container = document.createElement('div');
    container.id = 'auction-widget';
    container.className = 'auction-widget-container';
    container.innerHTML = '<style>' +
      '.auction-widget-container { border: 2px solid #ff6b6b;  padding: 24px; margin: 24px 0; border-radius: 8px; background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%); }' +
      '.auction-title { margin: 0 0 16px 0; font-size: 24px; font-weight: bold; color: #333; }' +
      '.auction-current-bid { font-size: 32px; font-weight: bold; color: #ff6b6b; margin: 16px 0; }' +
      '.auction-info { color: #666; margin: 8px 0; font-size: 14px; }' +
      '.auction-btn { border: none; padding: 14px 28px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 600; margin-top: 16px; transition: transform 0.2s; }' +
      '.auction-btn:hover { transform: translateY(-2px); }' +
      '.auction-btn-primary { background: #ff6b6b; color: white; }' +
      '.auction-btn-success { background: #51cf66; color: white; }' +
      '.auction-input { width: 100%; padding: 12px; margin: 8px 0; border: 2px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }' +
      '.auction-input:focus { outline: none; border-color: #ff6b6b; }' +
      '.auction-message { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 14px; }' +
      '.auction-message.success { background: #d3f9d8; color: #2b8a3e; }' +
      '.auction-message.error { background: #ffe3e3; color: #c92a2a; }' +
      '.winner-section { background: #f8f9fa; border-left: 4px solid #339af0; padding: 16px; margin: 16px 0; border-radius: 4px; }' +
      '.winner-label { font-weight: bold; color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }' +
      '.winner-name { font-size: 18px; font-weight: bold; color: #1c7ed6; }' +
      '.winner-amount { color: #868e96; font-size: 14px; }' +
      '</style>' +
      '<div>' +
      '<h3 class="auction-title">🔴 Live Auction</h3>' +
      '<div id="winner-section-container"></div>' +
      '<div class="auction-current-bid" id="auction-current-bid">Current Bid: $' + (auction.current_highest_bid || 0).toFixed(2) + '</div>' +
      '<div class="auction-info">' +
      '<div>⏰ Ends: ' + new Date(auction.bidding_end_time).toLocaleString() + '</div>' +
      '<div>💰 Min. increment: $' + auction.min_increment.toFixed(2) + '</div>' +
      '</div>' +
      '<div id="auction-register-section"><button class="auction-btn auction-btn-primary" id="register-btn">Register to Bid</button></div>' +
      '<div id="auction-otp-form" style="display: none;">' +
      '<input type="tel" class="auction-input" id="phone-number" placeholder="+1234567890" required>' +
      '<div id="recaptcha-container"></div>' +
      '<button class="auction-btn auction-btn-primary" id="send-otp">Send OTP</button>' +
      '</div>' +
      '<div id="auction-verify-form" style="display: none;">' +
      '<input type="text" class="auction-input" id="otp-code" placeholder="Enter 6-digit OTP" required>' +
      '<button class="auction-btn auction-btn-success" id="verify-otp">Verify OTP</button>' +
      '</div>' +
      '<div id="auction-registration-form" style="display: none;">' +
      '<input type="text" class="auction-input" id="bidder-name" placeholder="Full Name" required>' +
      '<input type="email" class="auction-input" id="bidder-email" placeholder="Email Address" required>' +
      '<button class="auction-btn auction-btn-success" id="submit-registration">Submit Registration</button>' +
      '</div>' +
      '<div id="auction-bid-form" style="display: none;">' +
      '<input type="number" class="auction-input" id="bid-amount" placeholder="Enter Bid Amount" step="0.01" required>' +
      '<button class="auction-btn auction-btn-primary" id="submit-bid">Place Bid</button>' +
      '</div>' +
      '<div id="auction-message"></div>' +
      '</div>';

  // Insert after product form
  const productForm = document.querySelector('form[action*="/cart/add"]') ||
    document.querySelector('.product-form') ||
    document.querySelector('.product__info-container');

  if (productForm && productForm.parentNode) {
    productForm.parentNode.insertBefore(container, productForm.nextSibling);
  } else {
    const productSection = document.querySelector('.product');
    if (productSection) {
      productSection.appendChild(container);
    }
  }

  updateWinnerDisplay(auction);
  setupEventHandlers(auction, isRegistrationClosed);
  setupRealtimeUpdates(auction.id);
  
  // Auto-initialize state based on saved data
  // Populate verified variables from localStorage if available
  if (savedPhone) verifiedPhone = savedPhone;
  if (savedEmail) verifiedEmail = savedEmail;
  if (savedName) verifiedName = savedName;
  
  if (isRegistrationClosed) {
    if (existingBidderId) {
      // User is registered, allow bidding
      widgetState = 'bid';
      transitionToState('bid');
    } else {
      // User is NOT registered, block access
      widgetState = 'loading';
      showMessage('⚠️ Registration window closed. You cannot register for this auction.', 'error');
      document.getElementById('auction-register-section').style.display = 'none';
    }
  } else if (existingBidderId) {
    widgetState = 'bid';
    transitionToState('bid');
  } else if (savedPhone && savedEmail && savedName) {
    widgetState = 'register';
    transitionToState('register');
    document.getElementById('bidder-name').value = savedName;
    document.getElementById('bidder-email').value = savedEmail;
  }
}

function updateWinnerDisplay(auction) {
  const container = document.getElementById('winner-section-container');
  if (!container) return;

  let html = '';
  const highestBid = auction.current_highest_bid || 0;
  const leaderName = auction.highest_bidder_name || 'No bids yet';

  if (auction.status === 'ended') {
    html = '<div class="winner-section" style="border-color: #2b8a3e; background: #ebfbee;">' +
      '<div class="winner-label" style="color: #2b8a3e;">🏆 Ultimate Winner</div>' +
      '<div class="winner-name" style="color: #2b8a3e;">' + leaderName + '</div>' +
      '<div class="winner-amount">Winning Bid: $' + highestBid.toFixed(2) + '</div>' +
      '</div>';
  } else if (auction.status === 'live' && auction.highest_bidder_name) {
    html = '<div class="winner-section">' +
      '<div class="winner-label">👑 Current Leader</div>' +
      '<div class="winner-name">' + leaderName + '</div>' +
      '<div class="winner-amount">Bid: $' + highestBid.toFixed(2) + '</div>' +
      '</div>';
  } else {
    html = '<div class="winner-section" style="border-color: #adb5bd;">' +
      '<div class="winner-label">Starting Soon</div>' +
      '<div class="winner-amount">No winner yet</div>' +
      '</div>';
  }

  container.innerHTML = html;
}

function transitionToState(newState) {
  widgetState = newState;
  
  document.getElementById('auction-register-section').style.display = 'none';
  document.getElementById('auction-otp-form').style.display = 'none';
  document.getElementById('auction-verify-form').style.display = 'none';
  document.getElementById('auction-registration-form').style.display = 'none';
  document.getElementById('auction-bid-form').style.display = 'none';
  
  if (newState === 'otp') {
    document.getElementById('auction-otp-form').style.display = 'block';
  } else if (newState === 'verifyOtp') {
    document.getElementById('auction-verify-form').style.display = 'block';
  } else if (newState === 'register') {
    document.getElementById('auction-registration-form').style.display = 'block';
  } else if (newState === 'bid') {
    document.getElementById('auction-bid-form').style.display = 'block';
  }
}

function setupEventHandlers(auction, isRegistrationClosed) {
  const registerBtn = document.getElementById('register-btn');
  const sendOtpBtn = document.getElementById('send-otp');
  const verifyOtpBtn = document.getElementById('verify-otp');
  const submitRegistrationBtn = document.getElementById('submit-registration');
  const submitBidBtn = document.getElementById('submit-bid');
  
  // Step 1: Show OTP form or skip if already verified
  if (registerBtn) {
    registerBtn.onclick = async () => {
      if (isRegistrationClosed) {
        showMessage('⚠️ Registration window closed', 'error');
        return;
      }
      
      // Check if user is already verified in backend
      const savedPhone = localStorage.getItem('auction_user_phone');
      const savedEmail = localStorage.getItem('auction_user_email');
      if (savedPhone && savedEmail) {
        try {
          const checkRes = await fetch(API_BASE + '/api/auth/check-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: savedPhone, email: savedEmail })
          });
          const checkData = await checkRes.json();
          
          if (checkData.verified) {
            verifiedPhone = savedPhone;
            verifiedEmail = checkData.email || savedEmail || '';
            verifiedName = checkData.name || localStorage.getItem('auction_user_name') || '';
            transitionToState('register');
            if (verifiedName) document.getElementById('bidder-name').value = verifiedName;
            if (verifiedEmail) document.getElementById('bidder-email').value = verifiedEmail;
            showMessage('✅ Welcome back!', 'success');
            return;
          }
        } catch (err) {
          console.log('Check user failed, proceeding with OTP');
        }
      }
      
      transitionToState('otp');
      
      // Initialize reCAPTCHA (clear previous instance if exists)
      setTimeout(() => {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
        }
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          size: 'normal',
          callback: () => {}
        });
        window.recaptchaVerifier.render();
      }, 100);
    };
  }

  // Step 2: Send OTP (backend + Firebase)
  if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
      const phoneInput = document.getElementById('phone-number');
      if (!phoneInput) return;
      
      const phone = phoneInput.value.trim();
      if (!phone) {
        showMessage('Please enter phone number', 'error');
        return;
      }

      try {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'Sending...';
        
        // Call backend send-otp first
        const backendRes = await fetch(API_BASE + '/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        
        const backendData = await backendRes.json();
        if (!backendData.success) {
          throw new Error(backendData.error || 'Backend OTP send failed');
        }
        
        // Then send Firebase OTP
        confirmationResult = await firebaseAuth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
        verifiedPhone = phone;
        
        transitionToState('verifyOtp');
        showMessage('✅ OTP sent to ' + phone, 'success');
      } catch (err) {
        showMessage('Failed to send OTP: ' + err.message, 'error');
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Send OTP';
      }
    };
  }

  // Step 3: Verify OTP (Firebase + backend)
  if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async () => {
      const otpInput = document.getElementById('otp-code');
      if (!otpInput) return;
      
      const otp = otpInput.value.trim();
      if (!otp || otp.length !== 6) {
        showMessage('Please enter 6-digit OTP', 'error');
        return;
      }

      try {
        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = 'Verifying...';
        
        // Verify with Firebase first
        const userCredential = await confirmationResult.confirm(otp);
        firebaseIdToken = await userCredential.user.getIdToken();
        
        // Ensure name and email are set (use empty string if not available)
        if (!verifiedName) verifiedName = '';
        if (!verifiedEmail) verifiedEmail = '';
        
        // Then verify with backend (REQUIRED) - send idToken, phone, name, email only
        const backendRes = await fetch(API_BASE + '/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            idToken: firebaseIdToken,
            phone: verifiedPhone,
            name: verifiedName,
            email: verifiedEmail
          })
        });
        
        const backendData = await backendRes.json();
        if (!backendData.success) {
          throw new Error(backendData.error || 'Backend verification failed');
        }
        
        // Save verified user to localStorage
        localStorage.setItem('auction_user_phone', verifiedPhone);
        if (verifiedName) localStorage.setItem('auction_user_name', verifiedName);
        if (verifiedEmail) localStorage.setItem('auction_user_email', verifiedEmail);
        
        transitionToState('register');
        showMessage('✅ Phone verified! Complete your registration.', 'success');
      } catch (err) {
        showMessage('Invalid OTP: ' + err.message, 'error');
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = 'Verify OTP';
      }
    };
  }

  // Step 4: Submit registration
  if (submitRegistrationBtn) {
    submitRegistrationBtn.onclick = async () => {
      const nameInput = document.getElementById('bidder-name');
      const emailInput = document.getElementById('bidder-email');
      
      if (!nameInput || !emailInput) return;
      
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();

      if (!name || !email) {
        showMessage('Please fill all fields', 'error');
        return;
      }

      if (!verifiedPhone) {
        showMessage('Phone verification required', 'error');
        transitionToState('otp');
        return;
      }

      try {
        submitRegistrationBtn.disabled = true;
        submitRegistrationBtn.textContent = 'Registering...';
        
        const res = await fetch(API_BASE + '/api/register-bidder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auction_id: auction.id, name, phone: verifiedPhone, email })
        });

        const data = await res.json();

        if (data.success) {
          localStorage.setItem('bidder_' + auction.id, data.bidder_id);
          localStorage.setItem('auction_user_email', email);
          localStorage.setItem('auction_user_name', name);
          
          transitionToState('bid');
          showMessage('✅ Registration successful! You can now place bids.', 'success');
        } else {
          showMessage(data.error || 'Registration failed', 'error');
          submitRegistrationBtn.disabled = false;
          submitRegistrationBtn.textContent = 'Submit Registration';
        }
      } catch (err) {
        showMessage('Network error. Please try again.', 'error');
        submitRegistrationBtn.disabled = false;
        submitRegistrationBtn.textContent = 'Submit Registration';
      }
    };
  }

  // Step 5: Place bid
  if (submitBidBtn) {
    submitBidBtn.onclick = async () => {
      const bidderId = localStorage.getItem('bidder_' + auction.id);
      const amountInput = document.getElementById('bid-amount');
      
      if (!amountInput) return;
      const amount = parseFloat(amountInput.value);

      if (!bidderId) {
        showMessage('Please register first', 'error');
        transitionToState('otp');
        return;
      }

      if (!amount || amount <= 0) {
        showMessage('Please enter a valid bid amount', 'error');
        return;
      }

      try {
        submitBidBtn.disabled = true;
        submitBidBtn.textContent = 'Placing bid...';
        
        const res = await fetch(API_BASE + '/api/place-bid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auction_id: auction.id,
            bidder_id: bidderId,
            amount
          })
        });

        const data = await res.json();

        if (data.success) {
          amountInput.value = '';
          showMessage('✅ Bid placed successfully!', 'success');
        } else {
          showMessage(data.error || 'Bid failed', 'error');
        }
        
        submitBidBtn.disabled = false;
        submitBidBtn.textContent = 'Place Bid';
      } catch (err) {
        showMessage('Network error. Please try again.', 'error');
        submitBidBtn.disabled = false;
        submitBidBtn.textContent = 'Place Bid';
      }
    };
  }
}

function checkExistingRegistration(auctionId) {
  const bidderId = localStorage.getItem('bidder_' + auctionId);
  if (bidderId) {
    const registerSection = document.getElementById('auction-register-section');
    const bidSection = document.getElementById('auction-bid-form');
    if (registerSection) registerSection.style.display = 'none';
    if (bidSection) bidSection.style.display = 'block';
  }
}

function showMessage(msg, type) {
  const el = document.getElementById('auction-message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'auction-message ' + type;
  el.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      el.style.display = 'none';
    }, 5000);
  }
}

function setupRealtimeUpdates(auctionId) {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.onload = () => {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    supabase
      .channel('auction-bids-' + auctionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: 'auction_id=eq.' + auctionId
      }, (payload) => {
        const newBid = payload.new;
        if (!newBid || !newBid.amount) return;

        // Update price immediately
        const priceEl = document.getElementById('auction-current-bid');
        if (priceEl) {
          priceEl.textContent = 'Current Bid: $' + parseFloat(newBid.amount).toFixed(2);
        }
        showMessage('🔥 New bid placed: $' + parseFloat(newBid.amount).toFixed(2), 'success');

        // Re-fetch auction details to update "Current Leader" name
        fetch(API_BASE + '/api/auction/product/' + currentProductId)
          .then(res => res.json())
          .then(updatedAuction => {
            updateWinnerDisplay(updatedAuction);
          });
      })
      .subscribe();
  };
  document.head.appendChild(script);
}
 }) ();
`;

  return new NextResponse(widgetScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
    },
  })
}
