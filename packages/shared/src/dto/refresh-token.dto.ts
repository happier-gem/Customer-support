import { IsOptional, IsString } from 'class-validator';

/**
 * The refresh token is normally read from the httpOnly cookie set on
 * login/refresh. This body field is only a fallback for non-browser clients
 * (e.g. automated tests, mobile apps) that can't rely on cookies.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
