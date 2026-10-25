export class SellerCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SellerCenterError';
  }
}
export class SupplierAccountLockedError extends SellerCenterError {
  constructor(minutesLeft: number) {
    super(
      `Demasiados intentos fallidos. Vuelve a intentar en ${minutesLeft} minuto(s)`,
    );
  }
}
