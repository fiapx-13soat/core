import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  // Argon2id no serviço; aqui só a política de tamanho mínimo.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
