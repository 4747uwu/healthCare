import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const OwnerDashboard = () => {
    const [labs, setLabs] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortOrder, setSortOrder] = useState('asc');
    const [pagination, setPagination] = useState({});
    const [billingConfig, setBillingConfig] = useState(null);
    const [showBillingConfig, setShowBillingConfig] = useState(false);
    
    const navigate = useNavigate();

    useEffect(() => {
        fetchOwnerDashboard();
        fetchBillingConfig();
    }, [search, sortBy, sortOrder]);

    const fetchOwnerDashboard = async (page = 1) => {
        try {
            setLoading(true);
            const response = await api.get('/owner/dashboard', {
                params: { page, search, sortBy, sortOrder, limit: 20 }
            });

            if (response.data.success) {
                setLabs(response.data.data.labs);
                setStats(response.data.data.overallStats);
                setPagination(response.data.data.pagination);
            }
        } catch (error) {
            console.error('Error fetching owner dashboard:', error);
            toast.error('Failed to fetch dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const fetchBillingConfig = async () => {
        try {
            const response = await api.get('/owner/billing/config');
            if (response.data.success) {
                setBillingConfig(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching billing config:', error);
        }
    };

    const handleLabClick = (labId) => {
        navigate(`/owner/labs/${labId}/details`);
    };

    const handleBillLab = (labId) => {
        navigate(`/owner/labs/${labId}/billing`);
    };

    const updateBillingConfig = async (newConfig) => {
        try {
            const response = await api.put('/owner/billing/config', newConfig);
            if (response.data.success) {
                setBillingConfig(response.data.data);
                toast.success('Billing configuration updated successfully');
                setShowBillingConfig(false);
            }
        } catch (error) {
            console.error('Error updating billing config:', error);
            toast.error('Failed to update billing configuration');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Owner Dashboard</h1>
                <p className="text-gray-600">Manage labs, billing, and system-wide analytics</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-blue-600">{stats.totalLabs || 0}</div>
                    <div className="text-sm text-gray-600">Active Labs</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-green-600">{stats.totalStudies || 0}</div>
                    <div className="text-sm text-gray-600">Total Studies</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-purple-600">{stats.thisMonthStudies || 0}</div>
                    <div className="text-sm text-gray-600">This Month</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-2xl font-bold text-orange-600">₹{stats.totalRevenue || 0}</div>
                    <div className="text-sm text-gray-600">Total Revenue</div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center">
                        <input
                            type="text"
                            placeholder="Search labs..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="name">Sort by Name</option>
                            <option value="totalStudies">Sort by Studies</option>
                            <option value="createdAt">Sort by Date</option>
                        </select>
                        <button
                            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                        >
                            {sortOrder === 'asc' ? '↑' : '↓'}
                        </button>
                    </div>
                    <button
                        onClick={() => setShowBillingConfig(true)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Configure Billing
                    </button>
                </div>
            </div>

            {/* Labs Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Lab Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Contact
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Studies
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Growth
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {labs.map((lab) => (
                            <tr key={lab._id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">{lab.name}</div>
                                        <div className="text-sm text-gray-500">{lab.identifier}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                        <div className="text-sm text-gray-900">{lab.contactPerson}</div>
                                        <div className="text-sm text-gray-500">{lab.contactEmail}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">
                                            Total: {lab.totalStudies}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            This Month: {lab.thisMonthStudies}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        lab.growthRate > 0 
                                            ? 'bg-green-100 text-green-800'
                                            : lab.growthRate < 0
                                                ? 'bg-red-100 text-red-800'
                                                : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {lab.growthRate > 0 ? '+' : ''}{lab.growthRate.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleLabClick(lab._id)}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            View Details
                                        </button>
                                        <button
                                            onClick={() => handleBillLab(lab._id)}
                                            className="text-green-600 hover:text-green-900"
                                        >
                                            Bill Lab
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                    <div className="flex gap-2">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => fetchOwnerDashboard(page)}
                                className={`px-3 py-2 rounded ${
                                    pagination.currentPage === page
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Billing Configuration Modal */}
            {showBillingConfig && billingConfig && (
                <BillingConfigModal
                    config={billingConfig}
                    onSave={updateBillingConfig}
                    onClose={() => setShowBillingConfig(false)}
                />
            )}
        </div>
    );
};

// ✅ BILLING CONFIG MODAL
const BillingConfigModal = ({ config, onSave, onClose }) => {
    const [modalityPricing, setModalityPricing] = useState(config.modalityPricing || []);
    const [defaultSettings, setDefaultSettings] = useState(config.defaultSettings || {});

    const updateModalityPrice = (index, newPrice) => {
        const updated = [...modalityPricing];
        updated[index].pricePerStudy = parseFloat(newPrice) || 0;
        setModalityPricing(updated);
    };

    const handleSave = () => {
        onSave({
            modalityPricing,
            defaultSettings
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6">Billing Configuration</h2>
                
                {/* Modality Pricing */}
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4">Modality Pricing</h3>
                    <div className="space-y-3">
                        {modalityPricing.map((modality, index) => (
                            <div key={modality.modality} className="flex items-center gap-4">
                                <span className="w-20 text-sm font-medium">{modality.modality}</span>
                                <input
                                    type="number"
                                    value={modality.pricePerStudy}
                                    onChange={(e) => updateModalityPrice(index, e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded w-32"
                                    placeholder="Price"
                                />
                                <span className="text-sm text-gray-500">per study</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Default Settings */}
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4">Default Settings</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Tax Rate (%)
                            </label>
                            <input
                                type="number"
                                value={defaultSettings.taxRate || 18}
                                onChange={(e) => setDefaultSettings({
                                    ...defaultSettings,
                                    taxRate: parseFloat(e.target.value) || 0
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Currency
                            </label>
                            <select
                                value={defaultSettings.currency || 'INR'}
                                onChange={(e) => setDefaultSettings({
                                    ...defaultSettings,
                                    currency: e.target.value
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded"
                            >
                                <option value="INR">INR</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OwnerDashboard;