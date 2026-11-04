import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

describe('Admin UI Components', () => {
  describe('Badge & StatusBadge', () => {
    it('renders label with variant styles', () => {
      render(<Badge label="Active" variant="success" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders "Needs Attention" label for needs_attention status', () => {
      render(<StatusBadge status="needs_attention" />);
      expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    });

    it('renders standard statuses correctly', () => {
      const { rerender } = render(<StatusBadge status="active" />);
      expect(screen.getByText('active')).toBeInTheDocument();

      rerender(<StatusBadge status="suspended" />);
      expect(screen.getByText('suspended')).toBeInTheDocument();

      rerender(<StatusBadge status="admin" />);
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
  });

  describe('Button', () => {
    it('renders children and handles click event', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Save Changes</Button>);

      const btn = screen.getByText('Save Changes');
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables button when loading is true', () => {
      const handleClick = jest.fn();
      render(
        <Button loading={true} onClick={handleClick}>
          Submit
        </Button>
      );

      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();

      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });
});
