'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FiX, FiSliders, FiClock, FiZap, FiShield } from 'react-icons/fi';

import { useSwapStore } from '@/store/swapStore';

interface SwapSettingsProps {
  onClose: () => void;
}

const SwapSettings: React.FC<SwapSettingsProps> = ({ onClose }) => {
  const { settings, setSettings } = useSwapStore();

  const slippagePresets = [50, 100, 300, 500]; // 0.5%, 1%, 3%, 5%
  const deadlinePresets = [10, 30, 60, 120]; // 10min, 30min, 1h, 2h

  const handleSlippageChange = (slippage: number) => {
    setSettings({ slippage });
  };

  const handleDeadlineChange = (deadline: number) => {
    setSettings({ deadline });
  };

  const handleCustomSlippage = (value: string) => {
    const slippage = parseFloat(value) * 100; // Convert to basis points
    if (!isNaN(slippage) && slippage >= 0 && slippage <= 5000) {
      setSettings({ slippage });
    }
  };

  const handleCustomDeadline = (value: string) => {
    const deadline = parseInt(value);
    if (!isNaN(deadline) && deadline > 0 && deadline <= 1440) {
      setSettings({ deadline });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center space-x-3">
            <FiSliders className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Swap Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Slippage Tolerance */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <FiZap className="w-4 h-4 text-primary-500" />
              <h4 className="font-medium text-gray-900 dark:text-white">
                Slippage Tolerance
              </h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Maximum difference between expected and actual swap price
            </p>

            {/* Preset Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {slippagePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleSlippageChange(preset)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    settings.slippage === preset
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {(preset / 100).toFixed(1)}%
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="relative">
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={(settings.slippage / 100).toFixed(1)}
                onChange={(e) => handleCustomSlippage(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Custom"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                %
              </span>
            </div>

            {settings.slippage > 500 && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  High slippage tolerance may result in unfavorable trades
                </p>
              </div>
            )}
          </div>

          {/* Transaction Deadline */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <FiClock className="w-4 h-4 text-primary-500" />
              <h4 className="font-medium text-gray-900 dark:text-white">
                Transaction Deadline
              </h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Maximum time before the swap expires
            </p>

            {/* Preset Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {deadlinePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleDeadlineChange(preset)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    settings.deadline === preset
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="relative">
              <input
                type="number"
                min="1"
                max="1440"
                value={settings.deadline}
                onChange={(e) => handleCustomDeadline(e.target.value)}
                className="w-full px-3 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Custom"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                min
              </span>
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <FiShield className="w-4 h-4 text-primary-500" />
              <h4 className="font-medium text-gray-900 dark:text-white">
                Advanced Settings
              </h4>
            </div>

            <div className="space-y-3">
              {/* Auto Refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Auto Refresh Quotes
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically update quotes every 30 seconds
                  </div>
                </div>
                <button
                  onClick={() => setSettings({ autoRefresh: !settings.autoRefresh })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.autoRefresh
                      ? 'bg-primary-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.autoRefresh ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Expert Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Expert Mode
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Enable advanced features and warnings
                  </div>
                </div>
                <button
                  onClick={() => setSettings({ expertMode: !settings.expertMode })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.expertMode
                      ? 'bg-primary-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.expertMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={onClose}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SwapSettings;