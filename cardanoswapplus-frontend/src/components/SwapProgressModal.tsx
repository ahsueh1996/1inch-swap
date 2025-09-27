'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiCheck, FiClock, FiAlertCircle, FiExternalLink } from 'react-icons/fi';

import { SwapProgress } from '@/types/swap';
import { useSwapStore } from '@/store/swapStore';

interface SwapProgressModalProps {
  onClose: () => void;
}

const SwapProgressModal: React.FC<SwapProgressModalProps> = ({ onClose }) => {
  const { currentOrder, swapProgress } = useSwapStore();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (swapProgress.length > 0) {
      const latestStep = swapProgress.findIndex(step =>
        step.status === 'loading' || step.status === 'pending'
      );
      setCurrentStep(latestStep >= 0 ? latestStep : swapProgress.length - 1);
    }
  }, [swapProgress]);

  const getStepIcon = (step: SwapProgress) => {
    switch (step.status) {
      case 'completed':
        return <FiCheck className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <FiAlertCircle className="w-5 h-5 text-red-500" />;
      case 'loading':
        return (
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        );
      default:
        return <FiClock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepColor = (step: SwapProgress) => {
    switch (step.status) {
      case 'completed':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'failed':
        return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      case 'loading':
        return 'border-primary-500 bg-primary-50 dark:bg-primary-900/20';
      default:
        return 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800';
    }
  };

  const getProgressPercentage = () => {
    const completedSteps = swapProgress.filter(step => step.status === 'completed').length;
    return Math.round((completedSteps / swapProgress.length) * 100);
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Swap Progress
            </h3>
            {currentOrder && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Order ID: {currentOrder.id.slice(0, 8)}...
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Overall Progress
            </span>
            <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
              {getProgressPercentage()}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <motion.div
              className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${getProgressPercentage()}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
          {swapProgress.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`relative flex items-start space-x-4 p-4 rounded-lg border-2 transition-all ${getStepColor(step)}`}
            >
              {/* Step Number & Icon */}
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-700 border-2 border-current">
                {step.status === 'loading' || step.status === 'pending' ? (
                  getStepIcon(step)
                ) : (
                  <span className="text-sm font-semibold">
                    {step.status === 'completed' ? <FiCheck className="w-4 h-4" /> : step.step}
                  </span>
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    {step.title}
                  </h4>
                  {step.estimatedTime && step.status === 'loading' && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ETA: {formatTime(step.estimatedTime)}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {step.description}
                </p>

                {/* Transaction Hash */}
                {step.txHash && (
                  <div className="mt-2">
                    <a
                      href={`https://etherscan.io/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <span>View Transaction</span>
                      <FiExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Loading Animation */}
                {step.status === 'loading' && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                      <div className="bg-primary-500 h-1 rounded-full animate-pulse" style={{ width: '60%' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Connection Line */}
              {index < swapProgress.length - 1 && (
                <div className="absolute left-4 top-12 w-0.5 h-6 bg-gray-300 dark:bg-gray-600" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        {currentOrder && (
          <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Status: </span>
                <span className="font-medium text-gray-900 dark:text-white capitalize">
                  {currentOrder.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Created: </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {new Date(currentOrder.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 mt-4">
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  // Implement cancel swap functionality
                  console.log('Cancel swap');
                }}
                className="flex-1 py-2 px-4 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg transition-colors"
              >
                Cancel Swap
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default SwapProgressModal;