// ============================================================================
// Auth Redux Slice
// ============================================================================
// Description: Authentication state management with Redux Toolkit
// Author: Senior Software Engineer
// Features: User auth, session management, role-based access
// Architecture: Clean Code, OOP Principles, Type-Safe
// ============================================================================

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { authService, type AuthUser, type SignUpData } from '@/services/authService';
import { broadcastLogin } from '@/utils/tabSyncManager';
import type { RootState } from '../store';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Authentication state shape
 * 
 * @property {User | null} user - Supabase Auth user object
 * @property {AuthUser | null} profile - Extended user profile from database
 * @property {boolean} isAuthenticated - Authentication status
 * @property {boolean} isLoading - Loading state for auth operations
 * @property {string | null} error - Error message if auth operation fails
 * @property {boolean} isInitialized - Whether auth state has been initialized
 */
interface AuthState {
  user: User | null;
  profile: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

/**
 * Login credentials interface
 */
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Registration data interface
 */
interface RegisterData extends SignUpData { }

// ============================================================================
// INITIAL STATE
// ============================================================================

/**
 * Initial authentication state
 * - No user logged in
 * - Not loading
 * - No errors
 * - Not initialized
 */
const initialState: AuthState = {
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isInitialized: false,
};

// ============================================================================
// ASYNC THUNKS
// ============================================================================

/**
 * Initialize authentication state
 * 
 * Checks for existing session and loads user data
 * Called on app startup to restore authentication state
 * 
 * @returns {Promise<User>} Authenticated user or null
 * @throws {Error} If session check fails
 */
export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      // Check for existing session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (!session) {
        return null;
      }

      // Get user profile from database using authService for consistent field mapping
      let profile = await authService.getUserProfile(session.user.id);

      // If profile doesn't exist, this might be an OAuth sign-in
      // Try to create the profile automatically
      if (!profile) {

        const oauthResult = await authService.handleOAuthSignIn(session.user);

        if (oauthResult.error) {
          console.error('❌ Failed to create OAuth profile:', oauthResult.error);
          throw new Error(oauthResult.error.message || 'Profile not found');
        }

        profile = oauthResult.profile;

        if (!profile) {
          throw new Error('Profile not found');
        }


      }

      // Check account status on initialization (e.g., page refresh)
      const accountStatus = profile.status?.toLowerCase();


      if (accountStatus !== 'active') {
        // Sign out the user immediately if not active
        await supabase.auth.signOut();


        // Return null instead of throwing to prevent initialization loop
        return null;
      }



      return {
        user: session.user,
        profile,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initialize authentication');
    }
  }
);

/**
 * Login user with email and password
 * 
 * Authenticates user and loads profile data
 * Logs authentication event to audit trail
 * 
 * @param {LoginCredentials} credentials - User login credentials
 * @returns {Promise<{ user: User; profile: AuthUser }>} Authenticated user data
 * @throws {Error} If login fails
 */
export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      // Sign in with authService (includes audit logging)
      const { user, error } = await authService.signIn(credentials);

      if (error || !user) {
        throw new Error(error?.message || 'Login failed');
      }



      // Get user profile from database using authService for consistent field mapping
      const profile = await authService.getUserProfile(user.id);

      console.log('👤 Profile fetched:', profile ? 'Found' : 'Not found');

      if (!profile) {
        // Profile not found - try to create it from user metadata


        const { error: createError } = await authService.createUserProfile(
          user.id,
          user.email || '',
          user.user_metadata || {}
        );

        if (createError) {
          console.error('Failed to create profile:', createError);
          throw new Error('Unable to load user profile. Please contact support.');
        }

        // Retry getting profile after creation
        const newProfile = await authService.getUserProfile(user.id);

        if (!newProfile) {
          throw new Error('Profile could not be loaded. Please contact support.');
        }

        // Check account status BEFORE allowing login
        const accountStatus = newProfile.status?.toLowerCase();


        if (accountStatus !== 'active') {
          // Sign out the user immediately
          await supabase.auth.signOut();

          // Throw specific error based on status
          if (accountStatus === 'inactive') {
            throw new Error('Your account is currently inactive. Please contact support@vanguardcargo.co for assistance.');
          } else if (accountStatus === 'suspended') {
            throw new Error('Your account has been suspended. Please contact support@vanguardcargo.co for assistance.');
          } else if (accountStatus === 'reported') {
            throw new Error('Your account is under review. Please contact support@vanguardcargo.co for assistance.');
          } else if (accountStatus === 'pending_verification') {
            throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
          } else {
            throw new Error('Your account status does not allow login at this time. Please contact support@vanguardcargo.co for assistance.');
          }
        }

        return {
          user,
          profile: newProfile,
        };
      }

      // Check account status BEFORE allowing login
      const accountStatus = profile.status?.toLowerCase();


      if (accountStatus !== 'active') {
        // Sign out the user immediately
        await supabase.auth.signOut();

        // Throw specific error based on status
        if (accountStatus === 'inactive') {
          throw new Error('Your account is currently inactive. Please contact support@vanguardcargo.co for assistance.');
        } else if (accountStatus === 'suspended') {
          throw new Error('Your account has been suspended. Please contact support@vanguardcargo.co for assistance.');
        } else if (accountStatus === 'reported') {
          throw new Error('Your account is under review. Please contact support@vanguardcargo.co for assistance.');
        } else if (accountStatus === 'pending_verification') {
          throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
        } else {
          throw new Error('Your account status does not allow login at this time. Please contact support@vanguardcargo.co for assistance.');
        }
      }



      return {
        user,
        profile,
      };
    } catch (error: any) {
      console.error('❌ Login error:', error);
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

/**
 * Register new user
 * 
 * Creates auth account and user profile
 * Generates suite number automatically
 * 
 * @param {RegisterData} userData - New user registration data
 * @returns {Promise<{ user: User; profile: AuthUser }>} Created user data
 * @throws {Error} If registration fails
 */
export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData: RegisterData, { rejectWithValue }) => {
    try {
      // Sign up with authService
      const { user, error } = await authService.signUp(userData);

      if (error || !user) {
        throw new Error(error?.message || 'Registration failed');
      }

      // Get created profile using authService for consistent field mapping
      const profile = await authService.getUserProfile(user.id);

      if (!profile) {
        throw new Error('Profile not found after registration');
      }

      return {
        user,
        profile,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Registration failed');
    }
  }
);

/**
 * Logout current user
 * 
 * Signs out from Supabase Auth
 * Clears all auth state
 * Logs logout event to audit trail
 * 
 * @returns {Promise<void>}
 * @throws {Error} If logout fails
 */
export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      // Sign out with authService (includes audit logging)
      const { error } = await authService.signOut();

      if (error) {
        throw error;
      }

      return null;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Logout failed');
    }
  }
);

/**
 * Update user profile
 * 
 * Updates user profile data in database
 * 
 * @param {Partial<AuthUser>} updates - Profile fields to update
 * @returns {Promise<AuthUser>} Updated profile
 * @throws {Error} If update fails
 */
export const updateUserProfile = createAsyncThunk(
  'auth/updateProfile',
  async (updates: Partial<AuthUser>, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      const userId = state.auth.user?.id;

      if (!userId) {
        throw new Error('No authenticated user');
      }

      // Update profile using authService for consistency
      const { error } = await authService.updateUserProfile(userId, updates);

      if (error) {
        throw error;
      }

      // Get updated profile with properly mapped fields
      const profile = await authService.getUserProfile(userId);

      // If profile fetch fails, just merge updates into existing profile
      if (!profile) {
        const existingProfile = state.auth.profile;
        if (!existingProfile) {
          throw new Error('Profile not found after update');
        }

        // Merge updates into existing profile
        return {
          ...existingProfile,
          ...updates
        };
      }

      return profile;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Profile update failed');
    }
  }
);

// ============================================================================
// SLICE DEFINITION
// ============================================================================

/**
 * Auth slice with reducers and actions
 * 
 * Manages authentication state and provides actions for:
 * - User login/logout
 * - User registration
 * - Profile updates
 * - Session management
 * - Error handling
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Set user data directly
     * Used for manual state updates or session restoration
     */
    setUser: (state, action: PayloadAction<{ user: User; profile: AuthUser }>) => {
      state.user = action.payload.user;
      state.profile = action.payload.profile;
      state.isAuthenticated = true;
      state.error = null;
    },

    /**
     * Clear user data
     * Used for logout or session expiration
     */
    clearUser: (state) => {
      state.user = null;
      state.profile = null;
      state.isAuthenticated = false;
      state.error = null;
    },

    /**
     * Set error message
     */
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    /**
     * Clear error message
     */
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Initialize auth
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        if (action.payload) {
          state.user = action.payload.user;
          state.profile = action.payload.profile;
          state.isAuthenticated = true;
        }
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.isInitialized = true;
        state.error = action.payload as string;
      });

    // Login user
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.profile = action.payload.profile;
        state.isAuthenticated = true;
        state.isInitialized = true;
        state.error = null;

        // Broadcast login to other tabs for synchronization
        broadcastLogin({ user: action.payload.user, profile: action.payload.profile });
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Register user
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.isLoading = false;
        // CRITICAL: Do NOT set isAuthenticated = true after registration
        // User must verify email and sign in before being authenticated
        // Just clear the error to indicate successful registration
        state.user = null; // Clear user - not authenticated yet
        state.profile = null; // Clear profile - not authenticated yet
        state.isAuthenticated = false; // NOT authenticated until email verified + login
        state.error = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Logout user
    builder
      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        // Clear all auth state on successful logout
        state.isLoading = false;
        state.user = null;
        state.profile = null;
        state.isAuthenticated = false;
        state.isInitialized = false;
        state.error = null;

      })
      .addCase(logoutUser.rejected, (state, action) => {
        // Clear auth state even on logout failure (critical!)
        state.isLoading = false;
        state.user = null;
        state.profile = null;
        state.isAuthenticated = false;
        state.isInitialized = false;
        state.error = action.payload as string;

      });

    // Update profile
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.profile = action.payload;
        state.error = null;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

// Export actions
export const { setUser, clearUser, setError, clearError } = authSlice.actions;

// Export reducer
export default authSlice.reducer;

// Export selectors
export const selectUser = (state: RootState) => state.auth.user;
export const selectProfile = (state: RootState) => state.auth.profile;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectIsLoading = (state: RootState) => state.auth.isLoading;
export const selectError = (state: RootState) => state.auth.error;
export const selectIsInitialized = (state: RootState) => state.auth.isInitialized;

// ============================================================================
// DOCUMENTATION
// ============================================================================

/**
 * USAGE EXAMPLES:
 * 
 * 1. Login user:
 * ```typescript
 * const dispatch = useAppDispatch();
 * await dispatch(loginUser({ email, password }));
 * ```
 * 
 * 2. Check auth status:
 * ```typescript
 * const isAuthenticated = useAppSelector(selectIsAuthenticated);
 * const profile = useAppSelector(selectProfile);
 * ```
 * 
 * 3. Logout:
 * ```typescript
 * await dispatch(logoutUser());
 * ```
 * 
 * 4. Update profile:
 * ```typescript
 * await dispatch(updateUserProfile({ firstName: 'John', lastName: 'Doe' }));
 * ```
 */
