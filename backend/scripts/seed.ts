/**
 * Creates a test clinic + test doctor for device testing.
 * Run with: npm run seed
 *
 * Test doctor mobile: 9999999999
 * OTP: check server logs, OR use 000000 if TEST_OTP_BYPASS=true
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create or reuse the test clinic
  let clinic = await prisma.clinic.findFirst({ where: { name: 'Test Clinic' } });
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        name:    'Test Clinic',
        address: '123 Main Street, Hyderabad',
        pincode: '500001',
        state:   'Telangana',
        phone:   '4023456789',
      },
    });
    console.log('Created test clinic:', clinic.id);
  } else {
    console.log('Test clinic already exists:', clinic.id);
  }

  // Create or reuse the test doctor
  let doctor = await prisma.doctor.findFirst({ where: { mobileNumber: '9999999999' } });
  if (!doctor) {
    doctor = await prisma.doctor.create({
      data: {
        name:         'Dr. Test Doctor',
        mobileNumber: '9999999999',
        clinicId:     clinic.id,
      },
    });
    console.log('Created test doctor:', doctor.id);
  } else {
    console.log('Test doctor already exists:', doctor.id);
  }

  console.log('\n✓ Seed complete');
  console.log('  Test mobile: 9999999999');
  console.log('  OTP: check server logs, or use 000000 if TEST_OTP_BYPASS=true');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
