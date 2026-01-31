import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loginUser, selectIsLoading } from '@/store/slices/authSlice';
import { authService } from '@/services/authService';
import DeliveryImage from '../../images/deliveryparcel.jpg';
import LoginBg from '../../images/register-bg.jpg';
// Import Google reCAPTCHA component
import ReCAPTCHA from 'react-google-recaptcha';
// Import reCAPTCHA configuration
import { recaptchaConfig } from '../../config/recaptcha';
// Import email verification banner component
import { EmailVerificationBanner } from '../../components/ui/EmailVerificationBanner';
// Import account status warning modal
import AccountStatusWarning from '../../components/ui/AccountStatusWarning';
// Import rate limiter for brute force protection
import { loginRateLimiter } from '../../utils/rateLimiter';
// Import Google OAuth button
import GoogleAuthButton from '../../components/auth/GoogleAuthButton';

/**
 * Extend Window interface to include grecaptcha property
 * This fixes TypeScript errors when accessing window.grecaptcha
 * 
 */
declare global {
	interface Window {
		grecaptcha?: {
			ready: (callback: () => void) => void;
			execute: (siteKey: string, options: { action: string }) => Promise<string>;
			render: (container: string | HTMLElement, parameters: object) => number;
		};
	}
}

/**
 * Login Component
 * Handles user authentication with enhanced reCAPTCHA integration
 * @author Senior Software Engineer
 */
export default function Login() {
	// Redux hooks
	const dispatch = useAppDispatch();
	const isLoading = useAppSelector(selectIsLoading);
	const navigate = useNavigate();
	const location = useLocation();

	// State to control whether email form is shown
	const [showEmailForm, setShowEmailForm] = useState(false);

	// Form state variables
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);
	const [error, setError] = useState("");
	const [showResendVerification, setShowResendVerification] = useState(false);
	const [isResending, setIsResending] = useState(false);
	const [resendMessage, setResendMessage] = useState("");

	// Email verification banner state
	const [showEmailVerificationBanner, setShowEmailVerificationBanner] = useState(false);
	const [verificationEmail, setVerificationEmail] = useState("");

	// reCAPTCHA state
	const [captchaValue, setCaptchaValue] = useState<string | null>(null);
	const [recaptchaError, setRecaptchaError] = useState(false);
	const recaptchaRef = useRef<ReCAPTCHA>(null);

	// Account status warning modal state
	const [showStatusWarning, setShowStatusWarning] = useState(false);
	const [accountStatusInfo, setAccountStatusInfo] = useState<{
		status: string;
		message: string;
		firstName?: string;
	} | null>(null);

	// Local loading state for pre-check
	const [isCheckingStatus, setIsCheckingStatus] = useState(false);

	// Rate limiting state
	const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);
	const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

	/**
	 * Handle resending email verification from banner
	 * @param emailAddress - Email address to send verification to
	 * @returns Promise with success status and message
	 */
	const handleBannerResendVerification = async (emailAddress: string): Promise<{ success: boolean; message: string }> => {
		try {
			const { authService } = await import('../../services/authService');
			const result = await authService.resendEmailVerification(emailAddress);

			if (result.error) {
				return {
					success: false,
					message: result.error || 'Failed to resend verification email'
				};
			} else {
				return {
					success: true,
					message: 'Verification email sent! Please check your inbox and spam folder.'
				};
			}
		} catch {
			return {
				success: false,
				message: 'Failed to resend verification email. Please try again.'
			};
		}
	};

	/**
	 * Handle resending email verification (legacy function)
	 */
	const handleResendVerification = async () => {
		if (!email) {
			setError("Please enter your email address first.");
			return;
		}

		setIsResending(true);
		setResendMessage("");
		setError("");

		try {
			const { authService } = await import('../../services/authService');
			const result = await authService.resendEmailVerification(email);

			if (result.error) {
				setError(result.error || 'Failed to resend verification email');
			} else {
				setResendMessage('Verification email sent! Please check your inbox and spam folder.');
				setShowResendVerification(false);
			}
		} catch {
			setError('Failed to resend verification email. Please try again.');
		} finally {
			setIsResending(false);
		}
	};

	/**
	 * Check URL parameters for email verification notification
	 * Display banner if user came from registration
	 */
	useEffect(() => {
		const urlParams = new URLSearchParams(location.search);
		const fromRegistration = urlParams.get('from') === 'registration';
		const emailParam = urlParams.get('email');

		if (fromRegistration && emailParam) {
			// Show email verification banner
			setShowEmailVerificationBanner(true);
			setVerificationEmail(decodeURIComponent(emailParam));
			// Pre-fill email field
			setEmail(decodeURIComponent(emailParam));
		}
	}, [location.search]);

	/**
	 * Check if reCAPTCHA script is loaded and available
	 * This helps detect issues with script loading in production
	 */
	useEffect(() => {
		// Check if reCAPTCHA is enabled in config
		if (!recaptchaConfig.enabled || recaptchaConfig.siteKey === 'disabled') {
			return;
		}

		// Only inject if not already present
		if (!document.querySelector('script[src*="recaptcha"]')) {
			// Create script element WITHOUT the problematic callback
			const script = document.createElement('script');
			script.src = `https://www.google.com/recaptcha/api.js`;
			script.async = true;
			script.defer = true;

			// Add onload handler to detect successful script loading
			script.onload = () => {
				console.log('✅ reCAPTCHA script loaded successfully');
				// Give a shorter delay for grecaptcha to initialize
				setTimeout(() => {
					if (window.grecaptcha) {
						console.log('✅ reCAPTCHA object available, waiting for ready state...');
						window.grecaptcha.ready(() => {
							console.log('✅ reCAPTCHA is ready and initialized');
							setRecaptchaError(false);
						});
					} else {
						console.log('⚠️ reCAPTCHA object not available yet, but proceeding anyway');
						// Still set loading to false so the component can try to render
						setRecaptchaError(false);
					}
				}, 800); // Reduced delay
			};

			// Add error handler
			script.onerror = () => {
				console.error('❌ Failed to load reCAPTCHA script');
				setRecaptchaError(true);
			};

			// Append to document
			document.head.appendChild(script);
			console.log('📝 reCAPTCHA script injected (without callback)');
		}
	}, []);

	/**
	 * Handle reCAPTCHA change
	 * @param {string | null} value - The reCAPTCHA token value
	 */
	const handleCaptchaChange = (value: string | null) => {
		setCaptchaValue(value);
		setRecaptchaError(false);
		if (value) {
			setError("");
		}
	};

	/**
	 * Handle reCAPTCHA expiration
	 */
	const handleCaptchaExpired = () => {
		setCaptchaValue(null);
		setError("reCAPTCHA has expired. Please verify again.");
	};

	/**
	 * Handle reCAPTCHA error (when it fails to load)
	 */
	const handleCaptchaError = () => {
		setRecaptchaError(true);
		setError("reCAPTCHA failed to load. Please check your internet connection and try again.");
	};

	/**
	 * Handle login form submission using Redux
	 */
	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");
		setRateLimitWarning(null);

		// STEP 1: Check rate limit (brute force protection)
		const rateLimitStatus = loginRateLimiter.checkLimit(email);

		if (!rateLimitStatus.allowed) {
			// Rate limit exceeded - show error and block login
			setError(rateLimitStatus.message || 'Too many login attempts. Please try again later.');
			setRateLimitWarning(rateLimitStatus.resetTimeFormatted);
			console.warn('🛡️ Login rate limit exceeded:', {
				email,
				resetTime: rateLimitStatus.resetTimeFormatted
			});
			return;
		}

		// Show remaining attempts warning if low
		if (rateLimitStatus.remainingAttempts <= 2 && rateLimitStatus.remainingAttempts > 0) {
			setRemainingAttempts(rateLimitStatus.remainingAttempts);
			console.warn(`⚠️ ${rateLimitStatus.remainingAttempts} login attempts remaining before rate limit`);
		} else {
			setRemainingAttempts(null);
		}

		// Validate reCAPTCHA (only if reCAPTCHA is enabled, loaded without errors, and we're not in a fallback state)
		if (recaptchaConfig.enabled && recaptchaConfig.siteKey !== 'disabled' && !recaptchaError && !captchaValue) {
			setError("Please verify that you are not a robot.");
			return;
		}

		// Start account status check in parallel (non-blocking)
		const statusCheckPromise = authService.checkAccountStatus(email);

		try {
			setIsCheckingStatus(true);

			// Login immediately (don't wait for status check)
			const result = await dispatch(loginUser({ email, password })).unwrap();

			// Login successful - Redux will handle state updates
			console.log('✅ Login successful!', result);

			// Clear errors and rate limit warnings
			setError("");
			setShowResendVerification(false);
			setShowEmailVerificationBanner(false);
			setIsCheckingStatus(false);
			setRateLimitWarning(null);
			setRemainingAttempts(null);

			// Navigate immediately (Redux Persist handles state save automatically)
			const requestedPath = (location.state as { from?: string })?.from || '/app/dashboard';
			// Validate redirect path to prevent open redirect attacks
			const isSafeRedirect = (path: string): boolean => {
				// Must start with / and not contain // (to prevent protocol-relative URLs)
				// Must not contain : before / (to prevent http:, javascript:, etc.)
				if (!path.startsWith('/') || path.startsWith('//')) return false;
				if (path.indexOf(':') !== -1 && path.indexOf(':') < path.indexOf('/')) return false;
				// Block common malicious patterns
				if (path.toLowerCase().includes('javascript:')) return false;
				return true;
			};
			const from = isSafeRedirect(requestedPath) ? requestedPath : '/app/dashboard';
			navigate(from, { replace: true });

		} catch (err: any) {
			// STEP 2: Record failed login attempt for rate limiting
			loginRateLimiter.recordAttempt(email);

			// Stop loading state
			setIsCheckingStatus(false);

			// Handle login errors
			const errorMessage = err?.message || String(err);
			const lowerErrorMessage = errorMessage.toLowerCase();

			console.error('❌ Login error:', errorMessage);

			// Check if error is about account status
			if (lowerErrorMessage.includes('inactive') ||
				lowerErrorMessage.includes('suspended') ||
				lowerErrorMessage.includes('reported') ||
				lowerErrorMessage.includes('under review')) {

				// Get account status info from the pre-check (if available)
				try {
					const statusCheck = await statusCheckPromise;
					if (statusCheck && !statusCheck.canLogin) {
						setAccountStatusInfo({
							status: statusCheck.status || 'inactive',
							message: statusCheck.message || errorMessage,
							firstName: statusCheck.firstName
						});
						setShowStatusWarning(true);
						return;
					}
				} catch {
					// Fallback if status check failed
				}

				// Fallback: Determine status from error message
				let status = 'inactive';
				if (lowerErrorMessage.includes('suspended')) status = 'suspended';
				else if (lowerErrorMessage.includes('reported') || lowerErrorMessage.includes('under review')) status = 'reported';

				// Show modal
				setAccountStatusInfo({
					status: status,
					message: errorMessage,
					firstName: undefined
				});
				setShowStatusWarning(true);
				return;
			}

			// Check for specific error types
			if (lowerErrorMessage.includes('email not confirmed') ||
				lowerErrorMessage.includes('not verified') ||
				lowerErrorMessage.includes('confirm your email') ||
				lowerErrorMessage.includes('verify your email')) {
				// Show email verification banner
				setShowEmailVerificationBanner(true);
				setVerificationEmail(email);
				setError("Your email address is not verified. Please check your email and click the verification link.");
				setShowResendVerification(true);
			} else if (lowerErrorMessage.includes('invalid_credentials') ||
				lowerErrorMessage.includes('invalid login') ||
				lowerErrorMessage.includes('invalid') ||
				lowerErrorMessage.includes('wrong password')) {
				setError("Invalid email or password. Please check your credentials and try again.");
				setShowResendVerification(false);
				setShowEmailVerificationBanner(false);
			} else if (lowerErrorMessage.includes('too_many_requests') ||
				lowerErrorMessage.includes('rate limit')) {
				setError("Too many login attempts. Please wait a few minutes before trying again.");
				setShowResendVerification(false);
				setShowEmailVerificationBanner(false);
			} else if (lowerErrorMessage.includes('profile not found')) {
				setError("Account profile not found. Please contact support.");
				setShowResendVerification(false);
				setShowEmailVerificationBanner(false);
			} else {
				// Show user-friendly error message
				setError(errorMessage || 'Login failed. Please try again.');
				setShowResendVerification(false);
				setShowEmailVerificationBanner(false);
			}
		}
	};

	// Check if form is valid for submission
	const isFormValid = email && password && (
		!recaptchaConfig.enabled || recaptchaError || captchaValue
	);

	// Combined loading state (checking status OR authenticating)
	const isSubmitting = isCheckingStatus || isLoading;

	return (
		<div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4" style={{ backgroundImage: `url(${LoginBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
			<div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl overflow-hidden">
				<div className="flex flex-col lg:flex-row min-h-[600px]">
					{/* Left panel: Delivery image */}
					<div className="w-full lg:w-1/2 bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center p-8" style={{ backgroundImage: `url(${DeliveryImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
						<div className="w-32 h-32 mx-auto mb-6 bg-white/20 rounded-full flex items-center justify-center">
							<svg className="w-20 h-20" fill="none" viewBox="0 0 24 24">
								<path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4V6zm8 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h4v1a1 1 0 0 0 2 0V9h2v10z" />
							</svg>
						</div>
						<h3 className="text-2xl font-bold mb-2 text-transparent">Secure cargo</h3>
						<p className="text-transparent">Your trusted delivery partner</p>
					</div>

					{/* Right panel: Login form */}
					<div className="w-full lg:w-1/2 p-8 lg:p-12 flex flex-col justify-center">
						<div className="max-w-sm mx-auto w-full">
							<div className="mb-8 text-center lg:text-left">
								<h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
								<p className="text-gray-600">Begin your cargo journey here</p>
							</div>

							{/* Google OAuth Button */}
							<div className="mb-6">
								<GoogleAuthButton
									buttonText="Continue with Google"
								/>

								{/* Divider */}
								<div className="relative my-6">
									<div className="absolute inset-0 flex items-center">
										<div className="w-full border-t border-gray-300"></div>
									</div>
									<div className="relative flex justify-center text-sm">
										<span className="px-4 bg-white text-gray-500">Or</span>
									</div>
								</div>

								{/* Continue with Email Button - Shows when form is hidden */}
								{!showEmailForm && (
									<button
										type="button"
										onClick={() => setShowEmailForm(true)}
										className="w-full px-4 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 flex items-center justify-center gap-2"
									>
										<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
										</svg>
										Continue with Email
									</button>
								)}
							</div>

							{/* Email Login Form - Only shown when Continue with Email is clicked */}
							{showEmailForm && (
								<form onSubmit={handleSubmit} className="space-y-6">
									{/* Email Verification Banner */}
									{showEmailVerificationBanner && verificationEmail && (
										<EmailVerificationBanner
											email={verificationEmail}
											onResendVerification={handleBannerResendVerification}
											onDismiss={() => setShowEmailVerificationBanner(false)}
											dismissible={true}
										/>
									)}

									{/* Error Message */}
									{error && (
										<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
											{error}
											{rateLimitWarning && (
												<div className="mt-2 flex items-center gap-2 text-sm">
													<Shield className="w-4 h-4" />
													<span>Try again in: <strong>{rateLimitWarning}</strong></span>
												</div>
											)}
										</div>
									)}

									{/* Rate Limit Warning */}
									{remainingAttempts !== null && remainingAttempts <= 2 && !error && (
										<div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
											<div className="flex items-center gap-2">
												<Shield className="w-5 h-5 flex-shrink-0" />
												<div>
													<p className="font-semibold">Security Notice</p>
													<p className="text-sm mt-1">
														You have <strong>{remainingAttempts}</strong> login {remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before temporary lockout.
													</p>
												</div>
											</div>
										</div>
									)}

									{/* Resend Verification (Legacy - kept for backward compatibility) */}
									{showResendVerification && !showEmailVerificationBanner && (
										<div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
											<p className="text-sm mb-3">
												<strong>Email verification required.</strong> Check your inbox for the verification link, or request a new one:
											</p>
											<button
												type="button"
												onClick={handleResendVerification}
												disabled={isResending || !email}
												className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
											>
												{isResending ? 'Sending...' : 'Resend Verification Email'}
											</button>
										</div>
									)}

									{/* Success Message for Resend (Legacy) */}
									{resendMessage && !showEmailVerificationBanner && (
										<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
											{resendMessage}
										</div>
									)}

									{/* Email Field */}
									<div>
										<label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
											Email Address *
										</label>
										<input
											type="email"
											id="email"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											placeholder="you@example.com"
											className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 outline-none"
											required
										/>
									</div>

									{/* Password Field */}
									<div>
										<label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
											Password *
										</label>
										<div className="relative">
											<input
												type={showPassword ? "text" : "password"}
												id="password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												placeholder="••••••••"
												className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 outline-none"
												required
											/>
											<button
												type="button"
												className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
												onClick={() => setShowPassword(!showPassword)}
											>
												{showPassword ? (
													<EyeOff className="w-5 h-5" />
												) : (
													<Eye className="w-5 h-5" />
												)}
											</button>
										</div>
									</div>

									{/* Remember Me & Forgot Password */}
									<div className="flex items-center justify-between">
										<label className="flex items-center space-x-2 cursor-pointer">
											<input
												type="checkbox"
												checked={rememberMe}
												onChange={(e) => setRememberMe(e.target.checked)}
												className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-500"
											/>
											<span className="text-sm text-gray-700">Remember Me</span>
										</label>

										{/* Link to Forgot Password page */}
										<Link
											to="/forgot-password"
											className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
										>
											Forgot password?
										</Link>
									</div>

									{/* Google reCAPTCHA */}
									{recaptchaConfig.enabled && recaptchaConfig.siteKey && (
										<div className="recaptcha-container">
											<ReCAPTCHA
												ref={recaptchaRef}
												sitekey={recaptchaConfig.siteKey}
												theme={recaptchaConfig.theme}
												size={recaptchaConfig.size}
												onChange={handleCaptchaChange}
												onExpired={handleCaptchaExpired}
												onErrored={handleCaptchaError}
												className="mt-2 mb-2"
											/>
										</div>
									)}

									{/* Submit Button */}
									<button
										type="submit"
										disabled={!isFormValid || isSubmitting}
										className={`w-full font-semibold px-6 py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${isFormValid && !isSubmitting
												? "bg-red-500 hover:bg-red-600 text-white transform hover:scale-105 hover:shadow-lg"
												: "bg-gray-300 text-gray-500 cursor-not-allowed"
											}`}
									>
										{isSubmitting ? (
											<>
												<Loader2 className="w-5 h-5 animate-spin" />
												<span>
													{isCheckingStatus ? 'Checking account...' : 'Signing in...'}
												</span>
											</>
										) : (
											"Sign In"
										)}
									</button>

									{/* Register Link */}
									<div className="text-center pt-4">
										<p className="text-sm text-gray-600">
											Don't have an account?{' '}
											{/* Link to Register page */}
											<Link
												to="/register"
												className="text-red-500 hover:text-red-600 font-medium transition-colors"
											>
												Register
											</Link>
										</p>
									</div>


								</form>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Account Status Warning Modal */}
			{showStatusWarning && accountStatusInfo && (
				<AccountStatusWarning
					status={accountStatusInfo.status}
					message={accountStatusInfo.message}
					firstName={accountStatusInfo.firstName}
					onClose={() => {
						setShowStatusWarning(false);
						setAccountStatusInfo(null);
					}}
				/>
			)}
		</div>
	);
}
