import { UserRole } from '../types';
import type { User } from '../types';

export const mockUsers: User[] = [
  {
    id: 'usr_1',
    name: 'Officer Singh',
    email: 'singh@landrevenue.gov.in',
    role: UserRole.GOVERNMENT_OFFICER,
    department: 'Land Revenue Department',
    designation: 'Chief Revenue Officer'
  },
  {
    id: 'usr_2',
    name: 'Priya Sharma',
    email: 'psharma@infrastructure.gov.in',
    role: UserRole.PROJECT_MANAGER,
    department: 'Infrastructure Division',
    designation: 'Senior Project Manager'
  },
  {
    id: 'usr_3',
    name: 'Rajesh Kumar',
    email: 'rkumar@fieldops.in',
    role: UserRole.WORKER,
    department: 'Field Operations',
    designation: 'Surveyor'
  },
  {
    id: 'usr_4',
    name: 'Ananya Patel',
    email: 'apatel@audit.gov.in',
    role: UserRole.VIEWER,
    department: 'Audit Department',
    designation: 'Compliance Auditor'
  }
];
