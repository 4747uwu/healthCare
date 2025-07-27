import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const OwnerManagement = () => {
    const [owners, setOwners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({});
    const [filters, setFilters] = useState({
        search: '',
        status: ''
    });
    const [stats, setStats] = useState({});
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(null);

    useEffect(() => {
        fetchOwners();
    }, [filters]);

    const fetchOwners = async (page = 1) => {
        try {
            setLoading(true);
            const response = await api.get('/admin/owners', {
                params: { page, ...filters, limit: 20 }
            });

            if (response.data.success) {
                setOwners(response.data.data);
                setPagination(response.data.pagination);
                setStats(response.data.stats);
            }
        } catch (error) {
            console.error('Error fetching owners:', error);
            toast.error('Failed to fetch owners');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateOwner = async (ownerData) => {
        try {
            const response = await api.post('/admin/owners', ownerData);
            
            if (response.data.success) {
                toast.success('Owner created successfully!');
                setShowCreateModal(false);
                fetchOwners();
            }
        } catch (error) {
            console.error('Error creating owner:', error);
            toast.error(error.response?.data?.message || 'Failed to create owner');
        }
    };

    const handleUpdateOwner = async (ownerId, ownerData) => {
        try {
            const response = await api.put(`/admin/owners/${ownerId}`, ownerData);
            
            if (response.data.success) {
                toast.success('Owner updated successfully!');
                setShowEditModal(false);
                setSelectedOwner(null);
                fetchOwners();
            }
        } catch (error) {
            console.error('Error updating owner:', error);
            toast.error(error.response?.data?.message || 'Failed to update owner');
        }
    };

    const handleDeleteOwner = async (ownerId, ownerName) => {
        if (!confirm(`Are you sure you want to delete owner "${ownerName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await api.delete(`/admin/owners/${ownerId}`);
            
            if (response.data.success) {
                toast.success('Owner deleted successfully!');
                fetchOwners();
            }
        } catch (error) {
            console.error('Error deleting owner:', error);
            toast.error(error.response?.data?.message || 'Failed to delete owner');
        }
    };

    const getStatusColor = (isActive) => {
        return isActive 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800';
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Owner Management</h1>
                        <p className="text-gray-600">Manage system owner accounts</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => window.location.href = '/admin/dashboard'}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                        >
                            ← Back to Dashboard
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            + Create Owner
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-2">
                            {stats.total || 0}
                        </div>
                        <div className="text-sm text-gray-600">Total Owners</div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-green-600 mb-2">
                            {stats.active || 0}
                        </div>
                        <div className="text-sm text-gray-600">Active Owners</div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-red-600 mb-2">
                            {stats.inactive || 0}
                        </div>
                        <div className="text-sm text-gray-600">Inactive Owners</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Search
                        </label>
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            placeholder="Search by name, email, or username..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Status
                        </label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={() => setFilters({ search: '', status: '' })}
                            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
            </div>

            {/* Owners Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Owner Details
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Permissions
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {owners.map((owner) => (
                            <tr key={owner._id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                        <div className="text-sm font-medium text-gray-900">
                                            {owner.fullName}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {owner.email}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            @{owner.username}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(owner.isActive)}`}>
                                        {owner.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-xs space-y-1">
                                        {owner.ownerPermissions?.canViewAllLabs && (
                                            <div className="text-green-600">✓ View All Labs</div>
                                        )}
                                        {owner.ownerPermissions?.canManageBilling && (
                                            <div className="text-green-600">✓ Manage Billing</div>
                                        )}
                                        {owner.ownerPermissions?.canSetPricing && (
                                            <div className="text-green-600">✓ Set Pricing</div>
                                        )}
                                        {owner.ownerPermissions?.canGenerateReports && (
                                            <div className="text-green-600">✓ Generate Reports</div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {new Date(owner.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setSelectedOwner(owner);
                                                setShowEditModal(true);
                                            }}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteOwner(owner._id, owner.fullName)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {owners.length === 0 && (
                    <div className="text-center py-12">
                        <div className="text-gray-500">
                            <h3 className="text-lg font-medium">No owners found</h3>
                            <p className="mt-1">No owners match your current filters.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="mt-6 flex justify-center">
                    <div className="flex gap-2">
                        {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                                key={page}
                                onClick={() => fetchOwners(page)}
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

            {/* Create Owner Modal */}
            {showCreateModal && (
                <CreateOwnerModal
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateOwner}
                />
            )}

            {/* Edit Owner Modal */}
            {showEditModal && selectedOwner && (
                <EditOwnerModal
                    owner={selectedOwner}
                    onClose={() => {
                        setShowEditModal(false);
                        setSelectedOwner(null);
                    }}
                    onSubmit={(data) => handleUpdateOwner(selectedOwner._id, data)}
                />
            )}
        </div>
    );
};

// Create Owner Modal Component
const CreateOwnerModal = ({ onClose, onSubmit }) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        fullName: '',
        isActive: true,
        ownerPermissions: {
            canViewAllLabs: true,
            canManageBilling: true,
            canSetPricing: true,
            canGenerateReports: true
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Create New Owner</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Full Name *
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Username *
                        </label>
                        <input
                            type="text"
                            required
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email *
                        </label>
                        <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password *
                        </label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Permissions
                        </label>
                        <div className="space-y-2">
                            {Object.entries({
                                canViewAllLabs: 'View All Labs',
                                canManageBilling: 'Manage Billing',
                                canSetPricing: 'Set Pricing',
                                canGenerateReports: 'Generate Reports'
                            }).map(([key, label]) => (
                                <label key={key} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.ownerPermissions[key]}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            ownerPermissions: {
                                                ...formData.ownerPermissions,
                                                [key]: e.target.checked
                                            }
                                        })}
                                        className="mr-2 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="mr-2 text-blue-600 focus:ring-blue-500"
                        />
                        <label className="text-sm font-medium text-gray-700">
                            Active Account
                        </label>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Create Owner
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Edit Owner Modal Component
const EditOwnerModal = ({ owner, onClose, onSubmit }) => {
    const [formData, setFormData] = useState({
        username: owner.username || '',
        email: owner.email || '',
        fullName: owner.fullName || '',
        newPassword: '',
        isActive: owner.isActive,
        ownerPermissions: owner.ownerPermissions || {
            canViewAllLabs: true,
            canManageBilling: true,
            canSetPricing: true,
            canGenerateReports: true
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const submitData = { ...formData };
        if (!submitData.newPassword || submitData.newPassword.trim() === '') {
            delete submitData.newPassword;
        }
        onSubmit(submitData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Edit Owner</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Username
                        </label>
                        <input
                            type="text"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            New Password
                        </label>
                        <input
                            type="password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Permissions
                        </label>
                        <div className="space-y-2">
                            {Object.entries({
                                canViewAllLabs: 'View All Labs',
                                canManageBilling: 'Manage Billing',
                                canSetPricing: 'Set Pricing',
                                canGenerateReports: 'Generate Reports'
                            }).map(([key, label]) => (
                                <label key={key} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.ownerPermissions[key]}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            ownerPermissions: {
                                                ...formData.ownerPermissions,
                                                [key]: e.target.checked
                                            }
                                        })}
                                        className="mr-2 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="mr-2 text-blue-600 focus:ring-blue-500"
                        />
                        <label className="text-sm font-medium text-gray-700">
                            Active Account
                        </label>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Update Owner
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OwnerManagement;