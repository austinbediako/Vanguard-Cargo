import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Save, AlertCircle } from 'lucide-react';
import 'react-phone-number-input/style.css';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import { useAppDispatch } from '../../store/hooks';
import { updateUserProfile } from '../../store/slices/authSlice';

interface PhoneNumberCollectionModalProps { }

export const PhoneNumberCollectionModal: React.FC<PhoneNumberCollectionModalProps> = () => {
	const dispatch = useAppDispatch();
	const [phone, setPhone] = useState('');
	const [country, setCountry] = useState<any>('GH'); // Default to Ghana
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	// Auto-detect country based on IP
	React.useEffect(() => {
		const detectCountry = async () => {
			try {
				const response = await fetch('https://ipapi.co/json/');
				if (response.ok) {
					const data = await response.json();
					if (data.country_code) {
						setCountry(data.country_code);
					}
				}
			} catch (error) {
				console.warn('Failed to detect country:', error);
				// Fallback to GH is already set in initial state
			}
		};

		detectCountry();
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// Basic validation
		if (!phone || !isValidPhoneNumber(phone)) {
			setError('Please enter a valid phone number');
			return;
		}

		setIsSaving(true);
		try {
			await dispatch(updateUserProfile({ phone })).unwrap();
			// Success is handled by the parent component (ReduxAuthGuard) 
			// which will re-render and hide this modal once profile.phone is set
		} catch (err: any) {
			setError(err.message || 'Failed to save phone number. Please try again.');
			setIsSaving(false);
		}
	};

	return (
		<AnimatePresence>
			<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
				>
					{/* Header */}
					<div className="bg-red-600 p-6 text-white text-center">
						<div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-4">
							<Phone className="w-6 h-6 text-white" />
						</div>
						<h2 className="text-xl font-bold">Phone Number Required</h2>
						<p className="text-red-100 text-sm mt-2">
							To ensure you receive important delivery updates, we need your phone number.
						</p>
					</div>

					{/* Form */}
					<div className="p-6">
						<form onSubmit={handleSubmit}>
							<div className="space-y-4">
								<div>
									<label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
										Mobile Phone Number
									</label>
									<PhoneInput
										id="phoneNumber"
										international
										defaultCountry={country}
										value={phone}
										onChange={(value) => {
											setPhone(value || '');
											if (value && isValidPhoneNumber(value)) {
												setError(null);
											}
										}}
										className="w-full px-4 py-3 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500 transition-all outline-none"
										disabled={isSaving}
									/>
									<p className="text-xs text-gray-500 mt-1">
										We'll use this for SMS notifications about your cargo.
									</p>
								</div>

								{error && (
									<div className="flex items-start bg-red-50 p-3 rounded-lg">
										<AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
										<p className="text-sm text-red-600">{error}</p>
									</div>
								)}

								<button
									type="submit"
									disabled={isSaving}
									className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
								>
									{isSaving ? (
										<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									) : (
										<>
											<Save className="w-4 h-4" />
											<span>Save Phone Number</span>
										</>
									)}
								</button>
							</div>
						</form>
					</div>
				</motion.div>
			</div>
		</AnimatePresence>
	);
};
